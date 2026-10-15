import { BadRequestException, Body, Controller, Get, Post, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/drizzle";
import { systemSettings } from "../../db/tables/system-settings.table";
import { mainCategories } from "../../db/tables/main-categories.table";
import { menuItems } from "../../db/tables/menu-items.table";
import { branches } from "../../db/tables/branches.table";
import { RequirePermission } from "../../common/permissions/require-permission.decorator";
import { requireBranchId, tenantInsert } from "../../common/tenant/tenant-context";
import {
  QR_MAX_ITEMS_LIMIT,
  QR_SETTING_KEYS,
  QR_WELCOME_MESSAGE_MAX,
  parseOrderingHours,
} from "../../common/qr/qr-settings";
import { CustomerAccessService } from "./customer-access.service";
import { PaymentProviderRegistry } from "../payment/providers/payment-provider.registry";
import { OrdersGateway } from "../order/orders.gateway";
import { cleanText } from "./customer.validation";
import { publicAllowedOrigins } from "../../common/tenant/public-path";

/** One printer section ("where it prints") and whether it has a printer. */
export interface SectionRouting {
  key: string;
  name: string;
  printer: string | null;
  routed: boolean;
}

/** printer_department_routing values: a bare printer name, or {printer, stations[]}. */
function printerOf(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  const v = (value ?? {}) as { printer?: unknown; stations?: unknown };
  const main = typeof v.printer === "string" ? v.printer.trim() : "";
  if (main) return main;
  const stations = Array.isArray(v.stations) ? (v.stations as Array<{ printer?: unknown }>) : [];
  const first = stations.map((s) => (typeof s?.printer === "string" ? s.printer.trim() : "")).find(Boolean);
  return first || null;
}

/** Owner settings for QR self-ordering (per branch). */
@ApiTags("settings")
@RequirePermission("settings")
@Controller("settings/qr")
export class QrSettingsController {
  constructor(
    private readonly access: CustomerAccessService,
    private readonly providers: PaymentProviderRegistry,
    private readonly gateway: OrdersGateway,
  ) {}

  @Get()
  async get() {
    const branchId = requireBranchId();
    const [branch] = await db
      .select({ name: branches.name, phone: branches.phone })
      .from(branches)
      .where(eq(branches.id, branchId))
      .limit(1);
    return {
      status: "success",
      data: {
        branch: { name: branch?.name ?? "", phone: branch?.phone ?? null },
        // Where table QR codes point (the guest web app). GUEST_BASE_URL wins;
        // otherwise the first allowed web origin.
        guest_base_url:
          (process.env.GUEST_BASE_URL || publicAllowedOrigins()[0] || "").replace(/\/+$/, "") || null,
        settings: await this.access.settings(branchId),
        providers: await this.providers.describe(branchId),
        sections: await this.sections(branchId),
      },
    };
  }

  @Put()
  async update(@Body() body: Record<string, unknown>) {
    const branchId = requireBranchId();
    const writes: Array<[string, string]> = [];
    const bool = (k: keyof typeof QR_SETTING_KEYS, v: unknown) => {
      if (v === undefined) return;
      if (typeof v !== "boolean") throw new BadRequestException("Choose on or off.");
      writes.push([QR_SETTING_KEYS[k], v ? "true" : "false"]);
    };
    bool("enabled", body.enabled);
    bool("requireCashierAccept", body.requireCashierAccept);
    bool("showPrices", body.showPrices);
    bool("allowNotes", body.allowNotes);
    bool("autoPrint", body.autoPrint);
    if (body.welcomeMessage !== undefined) {
      const msg = cleanText(body.welcomeMessage);
      if (msg.length > QR_WELCOME_MESSAGE_MAX) {
        throw new BadRequestException(`Keep the welcome message under ${QR_WELCOME_MESSAGE_MAX} characters.`);
      }
      writes.push([QR_SETTING_KEYS.welcomeMessage, msg]);
    }
    if (body.maxItemsPerOrder !== undefined) {
      const n = Number(body.maxItemsPerOrder);
      if (!Number.isInteger(n) || n < 1 || n > QR_MAX_ITEMS_LIMIT) {
        throw new BadRequestException(`Choose a number from 1 to ${QR_MAX_ITEMS_LIMIT}.`);
      }
      writes.push([QR_SETTING_KEYS.maxItemsPerOrder, String(n)]);
    }
    if (body.orderingHours !== undefined) {
      if (body.orderingHours === null) {
        writes.push([QR_SETTING_KEYS.orderingHours, ""]);
      } else {
        const raw = JSON.stringify(body.orderingHours);
        if (!parseOrderingHours(raw)) throw new BadRequestException("Enter opening and closing times like 08:00.");
        writes.push([QR_SETTING_KEYS.orderingHours, raw]);
      }
    }

    for (const [key, value] of writes) {
      await db
        .insert(systemSettings)
        .values({ ...tenantInsert(), key, value })
        .onConflictDoUpdate({
          target: [systemSettings.branch_id, systemSettings.key],
          set: { value, updated_at: new Date() },
        });
    }
    return { status: "success", data: { settings: await this.access.settings(branchId) } };
  }

  /**
   * Ask the branch's POS to print a sample QR ticket on one section's printer,
   * so the owner can check routing without placing a real order.
   */
  @Post("test-ticket")
  async testTicket(@Body() body: { section?: unknown }) {
    const section = cleanText(body?.section).toLowerCase();
    if (!section) throw new BadRequestException("Choose a section.");
    this.gateway.notifyTestTicket(requireBranchId(), { section });
    return { status: "success", data: { sent: true } };
  }

  private async sections(branchId: string): Promise<SectionRouting[]> {
    const [routingRow] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(and(eq(systemSettings.branch_id, branchId), eq(systemSettings.key, "printer_department_routing")))
      .limit(1);
    let routing: Record<string, unknown> = {};
    try {
      routing = routingRow?.value ? (JSON.parse(routingRow.value) as Record<string, unknown>) : {};
    } catch {
      routing = {};
    }
    const routed = new Map(Object.entries(routing).map(([k, v]) => [k.trim().toLowerCase(), printerOf(v)]));

    const named = await db
      .select({ slug: mainCategories.slug, name: mainCategories.name })
      .from(mainCategories)
      .where(and(eq(mainCategories.branch_id, branchId), eq(mainCategories.is_active, true)));
    const used = await db
      .selectDistinct({ main: menuItems.main_category })
      .from(menuItems)
      .where(and(eq(menuItems.branch_id, branchId), inArray(menuItems.type, ["cafe"])));

    const out = new Map<string, string>();
    for (const n of named) out.set(n.slug.trim().toLowerCase(), n.name);
    for (const u of used) {
      const key = String(u.main ?? "").trim().toLowerCase();
      if (key && !out.has(key)) out.set(key, key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
    }
    return [...out.entries()]
      .map(([key, name]) => {
        const printer = routed.get(key) ?? null;
        return { key, name, printer, routed: Boolean(printer) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
