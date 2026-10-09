import { Injectable } from "@nestjs/common";
import { db } from "../../db/drizzle";
import {
  paymentMethods,
  deliveryMethods,
  couriers,
  roles,
  users,
  orders,
  payments,
  systemSettings,
} from "../../db/schema";
import { and, eq } from "drizzle-orm";
import { hash, compare } from "bcryptjs";
import { requireBranchId, requireBusinessId, tenantInsert } from "../../common/tenant/tenant-context";
import { emitCreated, emitDeleted, emitUpdated } from "../sync/sync-emit.util";
import {
  CONFIGURABLE_HISTORY_ROLES,
  DEFAULT_HISTORY_LOOKBACK_DAYS,
  HISTORY_LOOKBACK_SETTING_KEY,
  LookbackMap,
  parseLookbackMap,
  resolveLookbackDays,
} from "../../common/history/lookback";
import {
  WAITER_VISIBLE_INVENTORY_SETTING_KEY,
  cleanItemIdList,
  parseItemIdList,
} from "../../common/inventory/waiter-visibility";
import {
  DELIVERY_ALLOWED_WAITERS_SETTING_KEY,
  cleanWaiterIdList,
  parseWaiterIdList,
} from "../../common/delivery/delivery-settings";
import {
  ORGANIZATION_ORDER_ALLOWED_USERS_SETTING_KEY,
  cleanOrgOrderUserIdList,
  parseOrgOrderUserIdList,
} from "../../common/organization/organization-settings";

@Injectable()
export class SettingsService {
  // ── Data Management ────────────────────────────────────────────────────────

  async cleanupData(): Promise<{
    ordersDeleted: number;
    paymentsDeleted: number;
  }> {
    const branchId = requireBranchId();
    return await db.transaction(async (tx) => {
      // Scope the wipe to the current branch only — never touch other tenants' data.
      // First delete payments (though cascade should handle it)
      const pResult = await tx
        .delete(payments)
        .where(eq(payments.branch_id, branchId));
      // Then delete orders
      const oResult = await tx
        .delete(orders)
        .where(eq(orders.branch_id, branchId));

      console.log(`[SettingsService] Data cleanup: Removed payments and orders for branch ${branchId}.`);

      return {
        ordersDeleted: 0, // Drizzle delete doesn't return count by default in some pg drivers without .returning().count() or similar, but we can just say success
        paymentsDeleted: 0,
      };
    });
  }

  // ── Payment Methods ────────────────────────────────────────────────────────

  async getAllPaymentMethods(): Promise<any[]> {
    return db
      .select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.branch_id, requireBranchId()),
          eq(paymentMethods.is_active, true),
        ),
      )
      .orderBy(paymentMethods.display_name);
  }

  async createPaymentMethod(data: any): Promise<any> {
    const [created] = await db
      .insert(paymentMethods)
      .values({
        ...tenantInsert(),
        ...(data.id ? { id: data.id } : {}),
        name: data.name,
        display_name: data.display_name,
        icon: data.icon || null,
        description: data.description || null,
        is_active: data.is_active !== false,
      })
      .returning();
    if (created) {
      await emitCreated(db, "payment_method", "PAYMENT_METHOD_CREATED", created as any);
    }
    return created;
  }

  async updatePaymentMethod(id: string, data: any): Promise<any> {
    const [updated] = await db
      .update(paymentMethods)
      .set({
        name: data.name,
        display_name: data.display_name,
        icon: data.icon,
        description: data.description,
        is_active: data.is_active,
        updated_at: new Date(),
      })
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.branch_id, requireBranchId())))
      .returning();
    if (!updated) throw new Error("Payment method not found");
    await emitUpdated(db, "payment_method", "PAYMENT_METHOD_UPDATED", updated as any);
    return updated;
  }

  async deletePaymentMethod(id: string): Promise<any> {
    const [deleted] = await db
      .update(paymentMethods)
      .set({ is_active: false, updated_at: new Date() })
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.branch_id, requireBranchId())))
      .returning();
    if (!deleted) throw new Error("Payment method not found");
    await emitUpdated(db, "payment_method", "PAYMENT_METHOD_DEACTIVATED", deleted as any);
    return deleted;
  }

  // ── Delivery Methods ────────────────────────────────────────────────────────

  async getAllDeliveryMethods(): Promise<any[]> {
    return db
      .select()
      .from(deliveryMethods)
      .where(
        and(
          eq(deliveryMethods.branch_id, requireBranchId()),
          eq(deliveryMethods.is_active, true),
        ),
      )
      .orderBy(deliveryMethods.display_name);
  }

  async createDeliveryMethod(data: any): Promise<any> {
    const [created] = await db
      .insert(deliveryMethods)
      .values({
        ...tenantInsert(),
        ...(data.id ? { id: data.id } : {}),
        name: data.name,
        display_name: data.display_name,
        icon: data.icon || null,
        description: data.description || null,
        is_active: data.is_active !== false,
      })
      .returning();
    if (created) {
      await emitCreated(db, "delivery_method", "DELIVERY_METHOD_CREATED", created as any);
    }
    return created;
  }

  async updateDeliveryMethod(id: string, data: any): Promise<any> {
    const [updated] = await db
      .update(deliveryMethods)
      .set({
        name: data.name,
        display_name: data.display_name,
        icon: data.icon,
        description: data.description,
        is_active: data.is_active,
        updated_at: new Date(),
      })
      .where(and(eq(deliveryMethods.id, id), eq(deliveryMethods.branch_id, requireBranchId())))
      .returning();
    if (!updated) throw new Error("Delivery method not found");
    await emitUpdated(db, "delivery_method", "DELIVERY_METHOD_UPDATED", updated as any);
    return updated;
  }

  async deleteDeliveryMethod(id: string): Promise<any> {
    const [deleted] = await db
      .update(deliveryMethods)
      .set({ is_active: false, updated_at: new Date() })
      .where(and(eq(deliveryMethods.id, id), eq(deliveryMethods.branch_id, requireBranchId())))
      .returning();
    if (!deleted) throw new Error("Delivery method not found");
    await emitUpdated(db, "delivery_method", "DELIVERY_METHOD_DEACTIVATED", deleted as any);
    return deleted;
  }

  // ── Couriers ────────────────────────────────────────────────────────────────
  // Preconfigured courier profiles (name/phone) an owner sets up so a cashier
  // can pick one from a dropdown on the delivery management dialog instead of
  // typing courier details by hand every time. Selecting a profile there just
  // copies name/phone onto the order — nothing references this table by
  // foreign key, so disabling/renaming a profile never rewrites history.

  async getAllCouriers(): Promise<any[]> {
    return db
      .select()
      .from(couriers)
      .where(
        and(
          eq(couriers.branch_id, requireBranchId()),
          eq(couriers.is_active, true),
        ),
      )
      .orderBy(couriers.name);
  }

  async createCourier(data: any): Promise<any> {
    const [created] = await db
      .insert(couriers)
      .values({
        ...tenantInsert(),
        ...(data.id ? { id: data.id } : {}),
        name: data.name,
        phone: data.phone || null,
        notes: data.notes || null,
        is_active: data.is_active !== false,
      })
      .returning();
    if (created) {
      await emitCreated(db, "courier", "COURIER_CREATED", created as any);
    }
    return created;
  }

  async updateCourier(id: string, data: any): Promise<any> {
    const setFields: any = { updated_at: new Date() };
    if (data.name !== undefined) setFields.name = data.name;
    if (data.phone !== undefined) setFields.phone = data.phone || null;
    if (data.notes !== undefined) setFields.notes = data.notes || null;
    if (data.is_active !== undefined) setFields.is_active = data.is_active;

    const [updated] = await db
      .update(couriers)
      .set(setFields)
      .where(and(eq(couriers.id, id), eq(couriers.branch_id, requireBranchId())))
      .returning();
    if (!updated) throw new Error("Courier not found");
    await emitUpdated(db, "courier", "COURIER_UPDATED", updated as any);
    return updated;
  }

  async deleteCourier(id: string): Promise<any> {
    const [deleted] = await db
      .update(couriers)
      .set({ is_active: false, updated_at: new Date() })
      .where(and(eq(couriers.id, id), eq(couriers.branch_id, requireBranchId())))
      .returning();
    if (!deleted) throw new Error("Courier not found");
    await emitUpdated(db, "courier", "COURIER_DEACTIVATED", deleted as any);
    return deleted;
  }

  // Per-branch list of waiter user ids the owner has allowed to place delivery
  // orders. Mirrors getWaiterVisibleInventoryItemIds below.
  async getDeliveryAllowedWaiterIds(): Promise<{ waiter_ids: string[] }> {
    const raw = await this.getSystemSetting(DELIVERY_ALLOWED_WAITERS_SETTING_KEY);
    return { waiter_ids: parseWaiterIdList(raw) };
  }

  async updateDeliveryAllowedWaiterIds(waiter_ids: unknown): Promise<{ waiter_ids: string[] }> {
    const clean = cleanWaiterIdList(waiter_ids);
    await this.setSystemSetting(DELIVERY_ALLOWED_WAITERS_SETTING_KEY, JSON.stringify(clean));
    return { waiter_ids: clean };
  }

  // Per-branch list of waiter/cashier user ids the owner has allowed to attach
  // an order to an organization while placing it. Same shape as the delivery
  // allow-list above; see organization-settings.ts for why it isn't role-scoped.
  async getOrganizationOrderAllowedUserIds(): Promise<{ user_ids: string[] }> {
    const raw = await this.getSystemSetting(ORGANIZATION_ORDER_ALLOWED_USERS_SETTING_KEY);
    return { user_ids: parseOrgOrderUserIdList(raw) };
  }

  async updateOrganizationOrderAllowedUserIds(user_ids: unknown): Promise<{ user_ids: string[] }> {
    const clean = cleanOrgOrderUserIdList(user_ids);
    await this.setSystemSetting(ORGANIZATION_ORDER_ALLOWED_USERS_SETTING_KEY, JSON.stringify(clean));
    return { user_ids: clean };
  }

  // ── Roles ──────────────────────────────────────────────────────────────────

  async getAllRoles(): Promise<any[]> {
    return db.select().from(roles).orderBy(roles.display_name);
  }

  async getRoleById(id: string): Promise<any> {
    const [row] = await db.select().from(roles).where(eq(roles.id, id));
    return row || null;
  }

  async createRole(data: any): Promise<any> {
    const [created] = await db
      .insert(roles)
      .values({
        ...(data.id ? { id: data.id } : {}),
        name: data.name,
        display_name: data.display_name,
        description: data.description || null,
        is_active: data.is_active !== false,
      })
      .returning();
    if (created) {
      await emitCreated(db, "role", "ROLE_CREATED", created as any);
    }
    return created;
  }

  async updateRole(id: string, data: any): Promise<any> {
    const [updated] = await db
      .update(roles)
      .set({
        name: data.name,
        display_name: data.display_name,
        description: data.description,
        is_active: data.is_active,
        updated_at: new Date(),
      })
      .where(eq(roles.id, id))
      .returning();
    if (!updated) throw new Error("Role not found");
    await emitUpdated(db, "role", "ROLE_UPDATED", updated as any);
    return updated;
  }

  async deleteRole(id: string): Promise<any> {
    const [deleted] = await db
      .update(roles)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(roles.id, id))
      .returning();
    if (!deleted) throw new Error("Role not found");
    await emitUpdated(db, "role", "ROLE_DEACTIVATED", deleted as any);
    return deleted;
  }

  // ── Seed Defaults ──────────────────────────────────────────────────────────

  async _seedDefaults(): Promise<void> {
    // Seed default roles if roles table is empty
    const existingRoles = await db.select().from(roles);
    if (existingRoles.length === 0) {
      const defaultRoles = [
        {
          name: "admin",
          display_name: "Administrator",
          description: "Full system access",
          is_active: true,
        },
        {
          name: "cashier",
          display_name: "Cashier",
          description: "Handles payments and checkout",
          is_active: true,
        },
        {
          name: "kitchen_staff",
          display_name: "Kitchen Staff",
          description: "Receives and fulfils kitchen orders",
          is_active: true,
        },
        {
          name: "cafe_waiter",
          display_name: "Café Waiter",
          description: "Serves customers and takes orders",
          is_active: true,
        },
      ];
      for (const r of defaultRoles) {
        await db.insert(roles).values(r).onConflictDoNothing();
      }
    }

    // Seed default payment methods if table is empty
    const existingPm = await db.select().from(paymentMethods);
    if (existingPm.length === 0) {
      const defaultMethods = [
        {
          name: "cash",
          display_name: "Cash",
          icon: "dollar-sign",
          description: "Cash payment",
          is_active: true,
        },
        {
          name: "qr_code",
          display_name: "QR Code",
          icon: "square",
          description: "QR code payment",
          is_active: true,
        },
        {
          name: "mobile_pay",
          display_name: "Mobile Pay",
          icon: "smartphone",
          description: "Mobile wallet",
          is_active: true,
        },
        {
          name: "card",
          display_name: "Card",
          icon: "credit-card",
          description: "Card payment",
          is_active: true,
        },
      ];
      for (const m of defaultMethods) {
        await db
          .insert(paymentMethods)
          .values({ ...tenantInsert(), ...m })
          .onConflictDoNothing();
      }
    }
  }

  // ── Current-User Settings ───────────────────────────────────────────────────

  async getCurrentUserSettings(userId: string): Promise<any> {
    const cancelPassword = await this.getSystemSetting("cancel_password");

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return { cancel_password: cancelPassword, print_copies: "1" };
    }

    const [row] = await db
      .select({
        print_copies: users.print_copies,
      })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.business_id, requireBusinessId())));

    return {
      cancel_password: cancelPassword,
      print_copies: row?.print_copies || "1" 
    };
  }

  async updateCancelPassword(userId: string, password: string): Promise<any> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      throw new Error("Invalid User ID");
    }
    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.business_id, requireBusinessId())));
    if (!user || user.role !== "admin") {
      throw new Error("Only admins can change the cancellation password.");
    }

    const hashed = await hash(password, 10);
    await this.setSystemSetting("cancel_password", hashed);
    return { cancel_password: hashed };
  }

  async verifyCancelPassword(
    userId: string,
    password: string,
  ): Promise<boolean> {
    const cancelPassword = await this.getSystemSetting("cancel_password");
    if (!cancelPassword) return false;
    return compare(password, cancelPassword);
  }

  async updatePrintCopies(userId: string, copies: string): Promise<any> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return { print_copies: copies };
    }
    const [updated] = await db
      .update(users)
      .set({ print_copies: copies, updated_at: new Date() })
      .where(and(eq(users.id, userId), eq(users.business_id, requireBusinessId())))
      .returning({ print_copies: users.print_copies });
    return updated;
  }

  // ── System Settings ─────────────────────────────────────────────────────────

  async getAllSystemSettings(): Promise<Array<{ key: string; value: string }>> {
    return db
      .select({ key: systemSettings.key, value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.branch_id, requireBranchId()));
  }

  async getSystemSetting(key: string): Promise<string | null> {
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.branch_id, requireBranchId()),
          eq(systemSettings.key, key),
        ),
      );
    return row?.value ?? null;
  }

  async setSystemSetting(key: string, value: string): Promise<void> {
    await db
      .insert(systemSettings)
      .values({ ...tenantInsert(), key, value })
      .onConflictDoUpdate({
        target: [systemSettings.branch_id, systemSettings.key],
        set: { value, updated_at: new Date() },
      });
  }

  async getInventorySettings(): Promise<{ allow_low_stock_orders: boolean }> {
    const raw = await this.getSystemSetting("allow_low_stock_orders");
    // Default to true when the branch has never set this explicitly — stock
    // deduction now happens at order placement, so blocking orders on a
    // shortfall by default would be a behavior change most branches don't want.
    return { allow_low_stock_orders: raw == null ? true : raw === "true" };
  }

  async updateInventorySettings(data: { allow_low_stock_orders: boolean }): Promise<{ allow_low_stock_orders: boolean }> {
    await this.setSystemSetting("allow_low_stock_orders", data.allow_low_stock_orders ? "true" : "false");
    return { allow_low_stock_orders: data.allow_low_stock_orders };
  }

  async getMenuAvailabilitySettings(): Promise<{ show_menu_inventory_availability: boolean }> {
    const raw = await this.getSystemSetting("show_menu_inventory_availability");
    return { show_menu_inventory_availability: raw === "true" };
  }

  async updateMenuAvailabilitySettings(data: { show_menu_inventory_availability: boolean }): Promise<{ show_menu_inventory_availability: boolean }> {
    await this.setSystemSetting("show_menu_inventory_availability", data.show_menu_inventory_availability ? "true" : "false");
    return { show_menu_inventory_availability: data.show_menu_inventory_availability };
  }

  // Per-branch list of inventory item ids the owner has chosen to expose to
  // waiters (e.g. on the sign-in page's Inventory tab). Stored as a single
  // JSON array under one key, mirroring role_history_lookback below.
  async getWaiterVisibleInventoryItemIds(): Promise<{ item_ids: string[] }> {
    const raw = await this.getSystemSetting(WAITER_VISIBLE_INVENTORY_SETTING_KEY);
    return { item_ids: parseItemIdList(raw) };
  }

  async updateWaiterVisibleInventoryItemIds(item_ids: unknown): Promise<{ item_ids: string[] }> {
    const clean = cleanItemIdList(item_ids);
    await this.setSystemSetting(WAITER_VISIBLE_INVENTORY_SETTING_KEY, JSON.stringify(clean));
    return { item_ids: clean };
  }

  async getOrganizationSettings(): Promise<{ allow_cashier_manage_org_orders: boolean }> {
    const raw = await this.getSystemSetting("allow_cashier_manage_org_orders");
    return { allow_cashier_manage_org_orders: raw === "true" };
  }

  async updateOrganizationSettings(data: {
    allow_cashier_manage_org_orders: boolean;
  }): Promise<{ allow_cashier_manage_org_orders: boolean }> {
    await this.setSystemSetting(
      "allow_cashier_manage_org_orders",
      data.allow_cashier_manage_org_orders ? "true" : "false",
    );
    return {
      allow_cashier_manage_org_orders: data.allow_cashier_manage_org_orders,
    };
  }

  async getTableSelectionSettings(): Promise<{ force_table_selection: boolean }> {
    const raw = await this.getSystemSetting("force_table_selection");
    return { force_table_selection: raw === "true" };
  }

  async updateTableSelectionSettings(data: { force_table_selection: boolean }): Promise<{ force_table_selection: boolean }> {
    await this.setSystemSetting("force_table_selection", data.force_table_selection ? "true" : "false");
    return { force_table_selection: data.force_table_selection };
  }

  // Per-branch printer department routing (which printers/stations a department
  // fans its tickets out to). Stored as a JSON blob under a single key so the
  // POS can mirror the whole map into its local config in one shot.
  async getPrinterRoutingSettings(): Promise<{
    printer_department_routing: Record<string, unknown>;
  }> {
    const raw = await this.getSystemSetting("printer_department_routing");
    let parsed: Record<string, unknown> = {};
    if (raw) {
      try {
        const value = JSON.parse(raw);
        if (value && typeof value === "object" && !Array.isArray(value)) {
          parsed = value;
        }
      } catch {
        // Corrupt/legacy value — treat as empty rather than failing the request.
      }
    }
    return { printer_department_routing: parsed };
  }

  async updatePrinterRoutingSettings(data: {
    printer_department_routing: Record<string, unknown>;
  }): Promise<{ printer_department_routing: Record<string, unknown> }> {
    const map =
      data?.printer_department_routing &&
      typeof data.printer_department_routing === "object" &&
      !Array.isArray(data.printer_department_routing)
        ? data.printer_department_routing
        : {};
    await this.setSystemSetting("printer_department_routing", JSON.stringify(map));
    return { printer_department_routing: map };
  }

  async getReceiptSettings(): Promise<{ enable_cashier_receipt: boolean }> {
    const raw = await this.getSystemSetting("enable_cashier_receipt");
    return { enable_cashier_receipt: raw === "true" };
  }

  async updateReceiptSettings(data: { enable_cashier_receipt: boolean }): Promise<{ enable_cashier_receipt: boolean }> {
    await this.setSystemSetting("enable_cashier_receipt", data.enable_cashier_receipt ? "true" : "false");
    return { enable_cashier_receipt: data.enable_cashier_receipt };
  }

  // Whether the POS should print a void/"DO NOT PREPARE" ticket to the kitchen
  // printers when an order that already reached the kitchen is cancelled.
  // Default off when unset — a branch opts in rather than every branch
  // silently starting to print cancellation tickets.
  async getCancellationPrintSettings(): Promise<{ print_cancelled_order_tickets: boolean }> {
    const raw = await this.getSystemSetting("print_cancelled_order_tickets");
    return { print_cancelled_order_tickets: raw === "true" };
  }

  async updateCancellationPrintSettings(data: { print_cancelled_order_tickets: boolean }): Promise<{ print_cancelled_order_tickets: boolean }> {
    await this.setSystemSetting("print_cancelled_order_tickets", data.print_cancelled_order_tickets ? "true" : "false");
    return { print_cancelled_order_tickets: data.print_cancelled_order_tickets };
  }

  // ── Per-role history lookback ───────────────────────────────────────────────
  // How many days of past payment/order history each staff role may view. Stored
  // as a single JSON blob under one key. The owner configures it from the web
  // dashboard; the resolved value for the logging-in user's role rides down on
  // the login response so every client applies the same window.

  async getRoleHistoryLookback(): Promise<{ role_history_lookback: LookbackMap }> {
    const raw = await this.getSystemSetting(HISTORY_LOOKBACK_SETTING_KEY);
    const stored = parseLookbackMap(raw);
    // Always surface a value for each configurable role so the UI has a default
    // to render even before the owner has saved anything.
    const map: LookbackMap = {};
    for (const role of CONFIGURABLE_HISTORY_ROLES) {
      map[role] = stored[role] ?? DEFAULT_HISTORY_LOOKBACK_DAYS;
    }
    for (const [key, value] of Object.entries(stored)) {
      if (!(key in map)) map[key] = value;
    }
    return { role_history_lookback: map };
  }

  async updateRoleHistoryLookback(
    input: LookbackMap,
  ): Promise<{ role_history_lookback: LookbackMap }> {
    const clean: LookbackMap = {};
    for (const [key, value] of Object.entries(input || {})) {
      const n = Number(value);
      if (Number.isFinite(n)) clean[String(key).toLowerCase()] = Math.trunc(n);
    }
    await this.setSystemSetting(
      HISTORY_LOOKBACK_SETTING_KEY,
      JSON.stringify(clean),
    );
    return this.getRoleHistoryLookback();
  }

  // Resolve the lookback (days; null = unlimited) for a role on a specific
  // branch. Used at login, where there is no ambient tenant branch yet.
  async resolveHistoryLookbackForBranch(
    branchId: string | null | undefined,
    role: string | null | undefined,
  ): Promise<number | null> {
    if (!branchId) return resolveLookbackDays(role, {});
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.branch_id, branchId),
          eq(systemSettings.key, HISTORY_LOOKBACK_SETTING_KEY),
        ),
      );
    return resolveLookbackDays(role, parseLookbackMap(row?.value ?? null));
  }

  // Branch-scoped cancellation override password, settable from the owner web
  // dashboard. We never return the stored hash — only whether one is set — so
  // it can't leak to the browser.
  async getCancelPasswordStatus(): Promise<{ is_set: boolean }> {
    const cancelPassword = await this.getSystemSetting("cancel_password");
    return { is_set: !!cancelPassword };
  }

  // Verify a typed cancel-order password against the branch's stored hash. Used
  // by clients (e.g. the web cashier portal) that can't validate locally the way
  // the desktop POS does against its mirrored hash.
  async verifySystemCancelPassword(password: string): Promise<boolean> {
    const cancelPassword = await this.getSystemSetting("cancel_password");
    if (!cancelPassword) return false;
    return compare(password, cancelPassword);
  }

  async updateSystemCancelPassword(password: string): Promise<{ is_set: boolean }> {
    if (!password || password.length < 6) {
      throw new Error("Cancel password must be at least 6 characters.");
    }
    const hashed = await hash(password, 10);
    await this.setSystemSetting("cancel_password", hashed);
    return { is_set: true };
  }

  // Branch-scoped printer-settings password, settable from the owner web
  // dashboard. Cashiers must enter it before opening the POS printer settings.
  // As with the cancel password we never return the stored hash — only whether
  // one is set — so it can't leak to the browser. The hash still rides down to
  // the desktop POS via system/all sync so it can verify offline.
  async getPrinterPasswordStatus(): Promise<{ is_set: boolean }> {
    const printerPassword = await this.getSystemSetting(
      "printer_settings_password",
    );
    return { is_set: !!printerPassword };
  }

  async verifyPrinterPassword(password: string): Promise<boolean> {
    const printerPassword = await this.getSystemSetting(
      "printer_settings_password",
    );
    if (!printerPassword) return false;
    return compare(password, printerPassword);
  }

  async updatePrinterPassword(password: string): Promise<{ is_set: boolean }> {
    if (!password || password.length < 4) {
      throw new Error("Printer settings password must be at least 4 characters.");
    }
    const hashed = await hash(password, 10);
    await this.setSystemSetting("printer_settings_password", hashed);
    return { is_set: true };
  }
}
