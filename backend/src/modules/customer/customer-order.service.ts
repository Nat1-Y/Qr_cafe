import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/drizzle";
import { menuItems } from "../../db/tables/menu-items.table";
import { orders } from "../../db/tables/orders.table";
import { order_item_additions } from "../../db/tables/order-item-additions.table";
import { OrderService } from "../order/order.service";
import {
  isStorablePrice,
  itemTypeFor,
  menuMainCategory,
  menuUnitPrice,
  orderTotal,
} from "../../common/ordering/order-line";
import {
  normalizeOrderStatus,
  normalizePaymentStatus,
} from "../../common/status/order-status.constants";
import { GuestOrder, toGuestOrder } from "../../common/ordering/guest-order";
import { requireBranchId } from "../../common/tenant/tenant-context";
import type { CustomerSession } from "./customer-session.service";
import type { TableAccess } from "./customer-access.service";
import type { GuestAddItemsInput, GuestLine, GuestOrderInput } from "./customer.validation";
import { CustomerMenuService } from "./customer-menu.service";

export type ChangeReason = "sold_out" | "unavailable" | "price_changed";

export interface MenuChange {
  menu_item_id: string;
  name: string | null;
  reason: ChangeReason;
  /** The current price, for price_changed. */
  price?: number;
}

interface PricedLine {
  menu_item_id: string;
  menu_item_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  main_category: string;
  item_type: "beverage" | "food";
  note: string | null;
}

export const MENU_CHANGED_MESSAGE = "Some items changed. Check your order and send it again.";

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

function isInsufficientInventory(err: unknown): boolean {
  const r = (err as { getResponse?: () => unknown })?.getResponse?.();
  return (r as { error?: string } | undefined)?.error === "insufficient_inventory";
}

@Injectable()
export class CustomerOrderService {
  constructor(
    private readonly orderService: OrderService,
    private readonly menu: CustomerMenuService,
  ) {}

  /**
   * Price every line from menu_items (never from the client) and check it can
   * still be ordered. Throws 409 menu_changed listing every problem at once, so
   * the guest sees one clear "we updated your order" diff.
   */
  async priceLines(lines: GuestLine[]): Promise<PricedLine[]> {
    const ids = [...new Set(lines.map((l) => l.menu_item_id))];
    const rows = await db
      .select()
      .from(menuItems)
      .where(
        and(
          inArray(menuItems.id, ids),
          eq(menuItems.branch_id, requireBranchId()),
          eq(menuItems.type, "cafe"),
        ),
      );
    const byId = new Map(rows.map((r) => [r.id, r]));
    const availability = await this.menu.availabilityMap();

    const changes: MenuChange[] = [];
    const seen = new Set<string>();
    const priced: PricedLine[] = [];
    for (const line of lines) {
      const item = byId.get(line.menu_item_id);
      const flag = (reason: ChangeReason, extra: Partial<MenuChange> = {}) => {
        const key = `${line.menu_item_id}:${reason}`;
        if (seen.has(key)) return;
        seen.add(key);
        changes.push({ menu_item_id: line.menu_item_id, name: item?.name ?? null, reason, ...extra });
      };
      if (!item || !item.is_available) {
        flag("unavailable");
        continue;
      }
      if (availability.get(item.id) === "out") {
        flag("sold_out");
        continue;
      }
      const unit = menuUnitPrice(item.price);
      if (!isStorablePrice(unit)) {
        // A fractional or missing price can't be stored (whole-birr columns);
        // the waiter flow fails on it too. Ask a person instead.
        flag("unavailable");
        continue;
      }
      if (line.seen_price != null && line.seen_price !== unit) {
        flag("price_changed", { price: unit });
        continue;
      }
      const main = menuMainCategory(item);
      priced.push({
        menu_item_id: item.id,
        menu_item_name: item.name,
        quantity: line.quantity,
        unit_price: unit,
        subtotal: unit * line.quantity,
        main_category: main,
        item_type: itemTypeFor(main),
        note: line.note,
      });
    }

    if (changes.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        code: "menu_changed",
        message: MENU_CHANGED_MESSAGE,
        changes,
      });
    }
    return priced;
  }

  async placeOrder(
    access: TableAccess,
    session: CustomerSession,
    input: GuestOrderInput,
    opts: { requireAccept: boolean },
  ): Promise<{ order: GuestOrder; replay: boolean }> {
    const replay = await this.findReplay(input.client_order_id, session);
    if (replay) return { order: replay, replay: true };

    const lines = await this.priceLines(input.items);

    const extraMeta: Record<string, unknown> = { qr_table_id: access.tableId };
    if (access.label) extraMeta.qr_table_label = access.label;
    if (input.customer_name) extraMeta.customer_name = input.customer_name;
    if (input.customer_phone) extraMeta.customer_phone = input.customer_phone;
    // Saved for later: with this on, the POS waits for a cashier to accept the
    // order before it prints (see shouldAutoPrintOrder on the desktop).
    if (opts.requireAccept) extraMeta.awaiting_accept = true;

    try {
      const created = await this.orderService.create(
        {
          id: input.client_order_id,
          type: "cafe",
          table_number: access.tableNumber,
          employee_id: null,
          waiter_id: null,
          items: lines,
          total_amount: orderTotal(lines),
          notes: input.order_note ?? undefined,
        },
        { source: "qr", customerSessionId: session.id, extraMeta },
      );
      if (!created) throw new UnprocessableEntityException("We couldn't send your order. Please try again.");
      return { order: toGuestOrder(created as Record<string, unknown>), replay: false };
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Two identical submits raced: the other one won. Same session → replay.
        const again = await this.findReplay(input.client_order_id, session);
        if (again) return { order: again, replay: true };
      }
      if (isInsufficientInventory(err)) {
        throw new ConflictException({
          statusCode: 409,
          code: "menu_changed",
          message: MENU_CHANGED_MESSAGE,
          changes: await this.soldOutChanges(input.items),
        });
      }
      throw err;
    }
  }

  async addItems(
    session: CustomerSession,
    orderId: string,
    input: GuestAddItemsInput,
  ): Promise<GuestOrder> {
    const order = await this.ownOrder(session, orderId);

    // addition_id doubles as a global idempotency key. A replay on this same
    // order is fine (addOrderItems no-ops it); one already used on another
    // order is a client bug or a probe — never treat it as success.
    const [prior] = await db
      .select({ order_id: order_item_additions.order_id })
      .from(order_item_additions)
      .where(eq(order_item_additions.id, input.addition_id))
      .limit(1);
    if (prior && prior.order_id !== order.id) {
      throw new ConflictException("Something went wrong adding items. Please try again.");
    }
    if (!prior) {
      const status = normalizeOrderStatus(order.status);
      const paid = normalizePaymentStatus(order.payment_status) === "paid";
      if (status !== "pending" || paid) {
        throw new ConflictException("This order is closed. Start a new order to add more.");
      }
    }

    // A replay (prior addition on this order) is a no-op inside addOrderItems,
    // so it needs no lines — and must not fail just because the menu moved on.
    const lines = prior ? [] : await this.priceLines(input.items);
    try {
      const updated = await this.orderService.addOrderItems(
        order.id,
        lines,
        null,
        input.addition_id,
      );
      if (!updated) throw new NotFoundException("We couldn't find that order.");
      // addOrderItems' own return value is read inside its transaction through
      // the pool (pre-commit state), so re-read the committed order.
      const fresh = await this.orderService.findById(order.id);
      return toGuestOrder((fresh ?? updated) as Record<string, unknown>);
    } catch (err) {
      if (isInsufficientInventory(err)) {
        throw new ConflictException({
          statusCode: 409,
          code: "menu_changed",
          message: MENU_CHANGED_MESSAGE,
          changes: await this.soldOutChanges(input.items),
        });
      }
      throw err;
    }
  }

  /** This session's orders, newest first. */
  async listForSession(session: CustomerSession): Promise<GuestOrder[]> {
    const rows = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.branch_id, requireBranchId()),
          eq(orders.customer_session_id, session.id),
        ),
      )
      .orderBy(desc(orders.created_at))
      .limit(20);
    const result: GuestOrder[] = [];
    for (const r of rows) {
      const full = await this.orderService.findById(r.id);
      if (full) result.push(toGuestOrder(full as Record<string, unknown>));
    }
    return result;
  }

  /** Order numbers of this session's open orders — for assist alerts. */
  async openOrderNumbers(session: CustomerSession): Promise<number[]> {
    const rows = await db
      .select({ n: orders.order_number })
      .from(orders)
      .where(
        and(
          eq(orders.branch_id, requireBranchId()),
          eq(orders.customer_session_id, session.id),
          eq(orders.status, "pending"),
        ),
      );
    return rows.map((r) => r.n).filter((n): n is number => n != null);
  }

  private async ownOrder(session: CustomerSession, orderId: string) {
    const [order] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.branch_id, requireBranchId()),
          eq(orders.customer_session_id, session.id),
        ),
      )
      .limit(1);
    if (!order) throw new NotFoundException("We couldn't find that order.");
    return order;
  }

  /**
   * client_order_id is reused as the order's primary key. An existing order
   * with that id is a replay ONLY if it belongs to this branch and this
   * session; anything else is an error, never a successful replay.
   */
  private async findReplay(clientOrderId: string, session: CustomerSession): Promise<GuestOrder | null> {
    const [existing] = await db
      .select({ id: orders.id, branch_id: orders.branch_id, session: orders.customer_session_id })
      .from(orders)
      .where(eq(orders.id, clientOrderId))
      .limit(1);
    if (!existing) return null;
    if (existing.branch_id !== session.branchId || existing.session !== session.id) {
      throw new ConflictException("Something went wrong sending your order. Please try again.");
    }
    const full = await this.orderService.findById(existing.id);
    return full ? toGuestOrder(full as Record<string, unknown>) : null;
  }

  private async soldOutChanges(lines: GuestLine[]): Promise<MenuChange[]> {
    const availability = await this.menu.availabilityMap();
    const ids = [...new Set(lines.map((l) => l.menu_item_id))];
    const rows = ids.length
      ? await db.select({ id: menuItems.id, name: menuItems.name }).from(menuItems).where(inArray(menuItems.id, ids))
      : [];
    const names = new Map(rows.map((r) => [r.id, r.name]));
    const out = ids.filter((id) => availability.get(id) !== "in_stock" && availability.has(id));
    return (out.length ? out : ids).map((id) => ({
      menu_item_id: id,
      name: names.get(id) ?? null,
      reason: "sold_out" as const,
    }));
  }
}
