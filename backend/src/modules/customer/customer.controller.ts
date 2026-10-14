import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseFilters,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { CustomerAccessService, TableAccess } from "./customer-access.service";
import { CustomerSessionService } from "./customer-session.service";
import { CustomerMenuService } from "./customer-menu.service";
import { CustomerOrderService } from "./customer-order.service";
import { AssistService } from "../order/assist.service";
import { RATE_RULES, RateLimiter } from "./rate-limiter";
import { PublicExceptionFilter } from "./public-exception.filter";
import {
  parseAssist,
  parseGuestAddItems,
  parseGuestOrder,
} from "./customer.validation";
import { PaymentProviderRegistry } from "../payment/providers/payment-provider.registry";
import { PaymentIntentsService } from "../payment/providers/payment-intents.service";

const SESSION_HEADER = "x-customer-session";

const SLOW_DOWN = "You're going a bit fast. Please wait a moment and try again.";
const TOO_MANY_ORDERS =
  "That's a lot of orders in a short time. Please wait a few minutes, or ask a member of staff.";
const ASSIST_WAIT = "We've let the staff know. Please give them a minute.";

const CLOSED_MESSAGES = {
  not_available: "Ordering from your table isn't available right now. Please order with a member of staff.",
  table_off: "Ordering from this table is turned off. Please order with a member of staff.",
  closed_now: "We're not taking orders from the table right now. Please order with a member of staff.",
} as const;

/**
 * Guest QR self-ordering API. Unauthenticated: the table token in the URL is
 * the only credential and the only source of tenancy (TenantMiddleware gives
 * /api/public/* a "public" context with no branch; each handler resolves the
 * token and runs inside that table's branch). No @RequirePermission — and none
 * is needed: there is no staff identity here at all.
 */
@ApiExcludeController()
@UseFilters(PublicExceptionFilter)
@Controller("public")
export class CustomerController {
  constructor(
    private readonly limiter: RateLimiter,
    private readonly access: CustomerAccessService,
    private readonly sessions: CustomerSessionService,
    private readonly menu: CustomerMenuService,
    private readonly orders: CustomerOrderService,
    private readonly assist: AssistService,
    private readonly payments: PaymentProviderRegistry,
    private readonly intents: PaymentIntentsService,
  ) {}

  @Get("t/:qrToken")
  async landing(
    @Param("qrToken") token: string,
    @Req() req: Request,
    @Headers(SESSION_HEADER) presented?: string,
  ) {
    this.limiter.consume(`landing:ip:${req.ip}`, RATE_RULES.landingPerIp, SLOW_DOWN);
    const table = await this.access.resolve(token);
    const settings = await this.access.settings(table.branchId);
    const ordering = this.access.orderingState(table, settings);
    const { session, token: sessionToken } = await this.sessions.startOrResume(
      table,
      presented,
      req.headers["user-agent"],
    );
    return {
      status: "success",
      data: {
        cafe: {
          name: table.branchName,
          logo_url: table.logoUrl,
          phone: table.phone,
          currency: table.currency,
          welcome_message: settings.welcomeMessage || null,
        },
        table: { number: table.tableNumber, label: table.label },
        ordering: {
          open: ordering.open,
          reason: ordering.reason,
          message: ordering.reason ? CLOSED_MESSAGES[ordering.reason] : null,
          hours: settings.orderingHours,
        },
        options: {
          show_prices: settings.showPrices,
          allow_notes: settings.allowNotes,
          max_items: settings.maxItemsPerOrder,
        },
        session: { token: sessionToken, expires_at: session.expiresAt.toISOString() },
      },
    };
  }

  @Get("t/:qrToken/menu")
  async getMenu(
    @Param("qrToken") token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.limiter.consume(`menu:ip:${req.ip}`, RATE_RULES.menuPerIp, SLOW_DOWN);
    const table = await this.access.resolve(token);
    const settings = await this.access.settings(table.branchId);
    const menu = await this.access.run(table, () =>
      this.menu.build({
        showPrices: settings.showPrices,
        imageUrlFor: (id) => `/api/public/t/${token}/menu/items/${id}/image`,
      }),
    );
    const body = { status: "success", data: menu };
    const etag = CustomerMenuService.etagOf(body);
    // Revalidate every time (availability changes), but a 304 costs ~nothing.
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "private, no-cache");
    if (req.headers["if-none-match"] === etag) {
      res.status(304);
      return undefined;
    }
    return body;
  }

  @Get("t/:qrToken/menu/items/:itemId/image")
  async itemImage(
    @Param("qrToken") token: string,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.limiter.consume(`menu:ip:${req.ip}`, RATE_RULES.menuPerIp, SLOW_DOWN);
    const table = await this.access.resolve(token);
    const img = await this.access.run(table, () => this.menu.inlineImage(itemId));
    if (!img) throw new NotFoundException("No picture for this item.");
    res.setHeader("Content-Type", img.mime);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(img.bytes);
  }

  @Post("t/:qrToken/orders")
  async placeOrder(
    @Param("qrToken") token: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Headers(SESSION_HEADER) headerSession?: string,
  ) {
    const table = await this.access.resolve(token);
    const session = await this.sessions.require(table, headerSession ?? sessionFromBody(body));
    this.limiter.consume(`order:ip:${req.ip}`, RATE_RULES.orderPerIp, TOO_MANY_ORDERS);
    this.limiter.consume(`order:s:${session.id}`, RATE_RULES.orderPerSession, TOO_MANY_ORDERS);

    const settings = await this.access.settings(table.branchId);
    this.assertOpen(table, settings);
    const input = parseGuestOrder(body, {
      allowNotes: settings.allowNotes,
      maxItems: settings.maxItemsPerOrder,
    });
    const { order, replay } = await this.access.run(table, () =>
      this.orders.placeOrder(table, session, input, { requireAccept: settings.requireCashierAccept }),
    );
    const payment = await this.access.run(table, () =>
      this.intents.checkoutOptions(table.branchId, order),
    );
    return { status: "success", data: { order, replay, payment } };
  }

  @Get("t/:qrToken/orders")
  async listOrders(
    @Param("qrToken") token: string,
    @Headers(SESSION_HEADER) headerSession?: string,
  ) {
    const table = await this.access.resolve(token);
    const session = await this.sessions.require(table, headerSession);
    this.limiter.consume(`read:s:${session.id}`, RATE_RULES.readPerSession, SLOW_DOWN);
    const orders = await this.access.run(table, () => this.orders.listForSession(session));
    return { status: "success", data: { orders } };
  }

  @Post("t/:qrToken/orders/:orderId/items")
  async addItems(
    @Param("qrToken") token: string,
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Headers(SESSION_HEADER) headerSession?: string,
  ) {
    const table = await this.access.resolve(token);
    const session = await this.sessions.require(table, headerSession ?? sessionFromBody(body));
    this.limiter.consume(`order:ip:${req.ip}`, RATE_RULES.orderPerIp, TOO_MANY_ORDERS);
    this.limiter.consume(`order:s:${session.id}`, RATE_RULES.orderPerSession, TOO_MANY_ORDERS);

    const settings = await this.access.settings(table.branchId);
    this.assertOpen(table, settings);
    const input = parseGuestAddItems(body, {
      allowNotes: settings.allowNotes,
      maxItems: settings.maxItemsPerOrder,
    });
    const order = await this.access.run(table, () => this.orders.addItems(session, orderId, input));
    return { status: "success", data: { order } };
  }

  @Post("t/:qrToken/assist")
  @HttpCode(200)
  async requestAssist(
    @Param("qrToken") token: string,
    @Body() body: unknown,
    @Headers(SESSION_HEADER) headerSession?: string,
  ) {
    const table = await this.access.resolve(token);
    const session = await this.sessions.require(table, headerSession ?? sessionFromBody(body));
    const type = parseAssist(body);
    this.limiter.consume(`assist:s:${session.id}`, RATE_RULES.assistPerSession, ASSIST_WAIT);
    const orderNumbers = await this.access.run(table, () => this.orders.openOrderNumbers(session));
    const request = this.assist.raise(table.branchId, {
      type,
      table_number: table.tableNumber,
      table_label: table.label,
      order_numbers: orderNumbers,
    });
    return { status: "success", data: { received: true, at: request.created_at } };
  }

  /** "How would you like to pay?" — only enabled providers. */
  @Get("t/:qrToken/payment-options")
  async paymentOptions(@Param("qrToken") token: string) {
    const table = await this.access.resolve(token);
    const options = await this.access.run(table, () => this.payments.enabledOptions(table.branchId));
    return { status: "success", data: { options } };
  }

  /**
   * Provider callbacks. Routed straight to the adapter, which must verify the
   * signature over the raw bytes; unverified calls change nothing.
   */
  @Post("payments/:provider/webhook")
  @HttpCode(200)
  async paymentWebhook(@Param("provider") provider: string, @Req() req: Request & { rawBody?: Buffer }) {
    const result = await this.intents.handleWebhook(provider, {
      headers: req.headers,
      rawBody: req.rawBody,
      body: req.body,
    });
    return { received: result.accepted };
  }

  private assertOpen(table: TableAccess, settings: Awaited<ReturnType<CustomerAccessService["settings"]>>) {
    const state = this.access.orderingState(table, settings);
    if (!state.open && state.reason) {
      throw new ForbiddenException({ statusCode: 403, code: "ordering_closed", message: CLOSED_MESSAGES[state.reason] });
    }
  }
}

function sessionFromBody(body: unknown): string | undefined {
  const s = (body as { session?: unknown } | null)?.session;
  return typeof s === "string" ? s : undefined;
}
