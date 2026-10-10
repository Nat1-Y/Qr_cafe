import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/drizzle";
import { menuItems } from "../../db/tables/menu-items.table";
import { order_items } from "../../db/tables/order-items.table";
import { orderStatusLogs } from "../../db/tables/order-status-logs.table";
import { order_item_additions } from "../../db/tables/order-item-additions.table";
import { orders } from "../../db/tables/orders.table";
import { payments } from "../../db/tables/payments.table";
import { systemSettings } from "../../db/tables/system-settings.table";
import { deliveryMethods } from "../../db/tables/delivery_methods.table";
import { deliveryOrderDetails } from "../../db/tables/delivery-order-details.table";
import { deliveryPayments } from "../../db/tables/delivery-payments.table";
import { organizations } from "../../db/tables/organizations.table";
import { org_credit_transactions } from "../../db/tables/org-credit-transactions.table";
import { users } from "../../db/tables/users.table";
import { randomUUID } from "crypto";
import { OrderInventoryService } from "./order-inventory.service";
import { emitCreated, emitUpdated } from "../sync/sync-emit.util";
import {
  getTenant,
  requireBranchId,
  requireBusinessId,
  tenantInsert,
} from "../../common/tenant/tenant-context";
import {
  DELIVERY_ALLOWED_WAITERS_SETTING_KEY,
  parseWaiterIdList,
} from "../../common/delivery/delivery-settings";
import {
  ORGANIZATION_ORDER_ALLOWED_USERS_SETTING_KEY,
  parseOrgOrderUserIdList,
} from "../../common/organization/organization-settings";
import {
  parseDateBoundInZone,
  resolveBranchTimezone,
} from "../../common/time/branch-timezone";
import {
  HISTORY_LOOKBACK_SETTING_KEY,
  historyLowerBoundDate,
  parseLookbackMap,
  resolveLookbackDays,
} from "../../common/history/lookback";
import { OrdersGateway } from "./orders.gateway";
import {
  ORDER_STATUS_PRIORITY,
  normalizeOrderStatus,
  normalizePaymentStatus,
  normalizePaymentRowStatus,
} from "../../common/status/order-status.constants";
import { isAllAccessRole } from "../../common/permissions/permissions.constants";

// Second alias on the users table so a single query can join both the waiter
// (orders.employee_id) and the cashier who rang the order up on their behalf
// (orders.cashier_id) without the two joins colliding.
const cashierUsers = alias(users, "cashier_user");

@Injectable()
export class OrderService {
  // Roles that place orders from the back office (web dashboard) rather than
  // from the POS floor. An order attributed to one of these is "owner-placed",
  // not a waiter's order. `admin` is intentionally excluded — it's also a POS
  // floor role, so its orders keep the existing waiter/cashier treatment.
  private static readonly BACK_OFFICE_ROLES = new Set([
    "owner",
    "business_admin",
    "super_admin",
  ]);

  constructor(
    private readonly orderInventoryService: OrderInventoryService,
    private readonly ordersGateway: OrdersGateway,
  ) {}

  private normalizeTableNumber(tableNumber: any): number | null {
    return tableNumber == null || tableNumber === "" ? null : tableNumber;
  }

  private normalizeOrganizationId(organizationId: any): string | null {
    return organizationId == null || organizationId === ""
      ? null
      : String(organizationId);
  }

  private validateUserId(
    userId: string,
    validUserIds: Set<string>,
    fallbackId?: string,
  ): string | null {
    if (validUserIds.has(userId)) return userId;
    if (fallbackId && validUserIds.has(fallbackId)) return fallbackId;
    return null;
  }

  private mapOrderItems(items: any[], orderId: string): any[] {
    return items.map((item: any) => ({
      ...tenantInsert(),
      order_id: orderId,
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal:
        Number(item.subtotal) ||
        Number(item.unit_price) * Number(item.quantity),
      item_type: item.item_type || "food",
      main_category: item.main_category,
      note: item.note || null,
    }));
  }

  private isValidUUID(uuid: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      uuid,
    );
  }

  /**
   * Drizzle wraps every failed query in a DrizzleQueryError whose `.message`
   * is just the SQL text + raw params — the actual Postgres error (constraint
   * name, code, detail) lives on `.cause` and is silently lost if callers only
   * log `error.message`. Pull it out so bulk-sync failures are diagnosable
   * from logs alone instead of just "Failed query: insert into ...".
   */
  private describeSyncError(error: unknown): string {
    const message = (error as Error)?.message ?? String(error);
    const cause = (error as any)?.cause;
    const causeMessage = cause?.message || cause?.detail;
    return causeMessage ? `${message} | cause: ${causeMessage}` : message;
  }

  /**
   * Same order/payment id appearing twice in one bulk-sync payload (a client
   * retry racing its own earlier in-flight attempt, a duplicated queue entry,
   * etc.) defeats the batch's one-time existingOrdersById pre-fetch: the
   * first occurrence inserts a fresh row, the second still sees "doesn't
   * exist yet" and tries to insert the same id again, crashing on the
   * primary-key constraint. Collapse duplicates up front — last write wins —
   * so at most one insert per id is ever attempted per batch.
   */
  private dedupeById<T extends { id?: any }>(items: T[], label: string): T[] {
    const byId = new Map<string, T>();
    const withoutId: T[] = [];
    for (const item of items) {
      const id = item?.id;
      if (id == null) {
        withoutId.push(item);
        continue;
      }
      byId.set(String(id), item);
    }
    const deduped = [...byId.values(), ...withoutId];
    const dropped = items.length - deduped.length;
    if (dropped > 0) {
      console.warn(
        `[BulkSync] Dropped ${dropped} duplicate ${label} id(s) from the same batch (kept the last occurrence of each)`,
      );
    }
    return deduped;
  }

  /**
   * Atomically reserve the next order serial for a branch. Runs inside the
   * caller's transaction; the upsert row-locks the counter so concurrent
   * creates can't hand out the same number.
   */
  private async nextOrderNumber(tx: any, branchId: string): Promise<number> {
    const result = await tx.execute(sql`
      INSERT INTO order_counters (branch_id, last_number)
      VALUES (${branchId}, 1)
      ON CONFLICT (branch_id)
      DO UPDATE SET last_number = order_counters.last_number + 1
      RETURNING last_number
    `);
    const row = (result as any)?.rows?.[0];
    return Number(row?.last_number ?? 0);
  }

  /**
   * Honor a serial an offline POS already stamped on printed tickets. The
   * client's number is permanent: if a web/back-office order took the same
   * serial while the POS was offline, THAT order is renumbered to the next
   * free serial and the incoming POS order keeps its own. Orders that
   * themselves kept an offline serial (meta.client_numbered) are never
   * renumbered — if two devices claim the same serial, the first to sync wins
   * and the later one falls back to a fresh counter number.
   */
  private async claimClientOrderNumber(
    tx: any,
    branchId: string,
    requested: number,
  ): Promise<{ order_number: number; client_numbered: boolean }> {
    // Push the branch counter past the claimed serial so future online orders
    // can't collide with it. The counter row lock also serializes this claim
    // against concurrent online creates taking numbers via nextOrderNumber.
    await tx.execute(sql`
      INSERT INTO order_counters (branch_id, last_number)
      VALUES (${branchId}, ${requested})
      ON CONFLICT (branch_id)
      DO UPDATE SET last_number = GREATEST(order_counters.last_number, ${requested})
    `);

    const [holder] = await tx
      .select({ id: orders.id, meta: orders.meta })
      .from(orders)
      .where(
        and(
          eq(orders.branch_id, branchId),
          eq(orders.order_number, requested),
        ),
      )
      .limit(1);

    if (!holder) {
      return { order_number: requested, client_numbered: true };
    }

    if ((holder.meta as any)?.client_numbered) {
      const fallback = await this.nextOrderNumber(tx, branchId);
      console.warn(
        `[BulkSync] Serial #${requested} already claimed by offline order ${holder.id}; assigning #${fallback} instead`,
      );
      return { order_number: fallback, client_numbered: false };
    }

    const bumped = await this.nextOrderNumber(tx, branchId);
    await tx
      .update(orders)
      .set({
        order_number: bumped,
        meta: { ...((holder.meta as any) ?? {}), renumbered_from: requested },
        updated_at: new Date(),
      })
      .where(eq(orders.id, holder.id));
    console.log(
      `[BulkSync] Renumbered online order ${holder.id} #${requested} → #${bumped}; offline order keeps #${requested}`,
    );
    return { order_number: requested, client_numbered: true };
  }

  private async getSetting(key: string): Promise<string | null> {
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.branch_id, requireBranchId()),
          eq(systemSettings.key, key),
        ),
      )
      .limit(1);
    return row?.value ?? null;
  }

  private async isLowStockAllowed(): Promise<boolean> {
    // Default to true when unset — see SettingsService.getInventorySettings.
    const raw = await this.getSetting("allow_low_stock_orders");
    return raw == null ? true : raw === "true";
  }

  private async isTableSelectionRequired(): Promise<boolean> {
    return (await this.getSetting("force_table_selection")) === "true";
  }

  /**
   * Validates a delivery_method_id belongs to the current branch and is
   * active. Throws BadRequestException otherwise — a stale/disabled/foreign
   * method id must never silently attach to an order.
   */
  private async resolveDeliveryMethod(deliveryMethodId: string) {
    const [method] = await db
      .select()
      .from(deliveryMethods)
      .where(
        and(
          eq(deliveryMethods.id, deliveryMethodId),
          eq(deliveryMethods.branch_id, requireBranchId()),
          eq(deliveryMethods.is_active, true),
        ),
      )
      .limit(1);
    if (!method) {
      throw new BadRequestException(
        "Selected delivery method is not available for this branch.",
      );
    }
    return method;
  }

  /**
   * Owner-configured allow-list restricting which waiters may place delivery
   * orders. Only enforced for the waiter's own self-service session (JWT role
   * `cafe_waiter`) — a cashier or owner placing an order on a waiter's behalf
   * from the back office is never blocked by this.
   */
  private async assertWaiterAllowedForDelivery(): Promise<void> {
    const tenant = getTenant();
    if (tenant?.role !== "cafe_waiter") return;
    const raw = await this.getSetting(DELIVERY_ALLOWED_WAITERS_SETTING_KEY);
    const allowed = parseWaiterIdList(raw);
    if (!tenant.userId || !allowed.includes(tenant.userId)) {
      throw new ForbiddenException(
        "You are not allowed to place delivery orders.",
      );
    }
  }

  /**
   * Owner-configured allow-list restricting which waiters/cashiers may attach
   * an order to an organization while placing it. Unlike
   * assertWaiterAllowedForDelivery, this isn't gated on tenant.role from a JWT
   * — the desktop POS carries no back-office JWT at all (tenant.role is always
   * null there per tenant-context.ts), so a check keyed off it would silently
   * never apply to the app's own order screens. Instead this resolves the
   * *acting* employee's role straight from the users table by id, which works
   * the same whether the request carried a real JWT or a device token. An
   * all-access role (owner/business_admin/super_admin) is always allowed, same
   * as every other owner-level bypass in this app.
   */
  private async assertUserAllowedForOrganizationOrder(
    actingUserId: string | null | undefined,
  ): Promise<void> {
    if (!actingUserId) {
      throw new ForbiddenException(
        "An order can only be attached to an organization by a known employee.",
      );
    }
    const [actor] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, actingUserId))
      .limit(1);
    if (isAllAccessRole(actor?.role)) return;

    const raw = await this.getSetting(
      ORGANIZATION_ORDER_ALLOWED_USERS_SETTING_KEY,
    );
    const allowed = parseOrgOrderUserIdList(raw);
    if (!allowed.includes(actingUserId)) {
      throw new ForbiddenException(
        "You are not allowed to attach orders to an organization.",
      );
    }
  }

  /**
   * Display-only contact details for who at the organization an order is
   * for — never a real account, never affects billing. Stored as flat
   * `meta` fields (not a nested object) so the many places that already
   * read `order.meta?.org_customer_name` keep working unchanged. Omits
   * anything not provided rather than writing empty strings.
   */
  private buildOrgCustomerMeta(
    name?: string,
    phone?: string,
    notes?: string,
  ): Record<string, string> {
    const meta: Record<string, string> = {};
    if (name) meta.org_customer_name = String(name).trim();
    if (phone) meta.org_customer_phone = String(phone).trim();
    if (notes) meta.org_customer_notes = String(notes).trim();
    return meta;
  }

  async create(orderData: any) {
    const {
      employee_id,
      waiter_id,
      created_by_id,
      cashier_id,
      customer_id,
      table_number,
      items,
      total_amount,
      notes,
      organization_id,
      // Contact details for the specific person at the organization this
      // order is for (e.g. "Abebe from Kabun Mesjid") — display-only
      // context, not a real account. Stored in `meta`, not columns: see
      // confirmOrganizationOrderPayment for where this order actually gets
      // billed to the organization.
      org_customer_name,
      org_customer_phone,
      org_customer_notes,
      is_price_override,
      delivery_method_id,
      is_takeaway,
    } = orderData;
    // A delivery order overrides whatever `type`/table came in — it's never a
    // dine-in "cafe" order and never carries a table number.
    const type = delivery_method_id ? "delivery" : orderData.type;

    // The waiter the order belongs to (defaults to the employee on the order).
    const finalWaiterId = waiter_id || employee_id;
    // An order is "placed by a cashier" when whoever created it differs from the
    // waiter it's attributed to. Waiters placing their own orders leave this null.
    const finalCashierId =
      cashier_id ||
      (created_by_id && created_by_id !== finalWaiterId ? created_by_id : null);

    // Delivery orders are never tied to a physical table.
    const safeTableNumber = delivery_method_id
      ? null
      : this.normalizeTableNumber(table_number);
    const safeOrganizationId = this.normalizeOrganizationId(organization_id);

    if (type === "cafe" || !type) {
      const requireTableSelection = await this.isTableSelectionRequired();
      if (
        requireTableSelection &&
        !is_takeaway &&
        (safeTableNumber == null ||
          isNaN(parseInt(String(safeTableNumber), 10)))
      ) {
        throw new BadRequestException(
          "Table selection is required for cafe orders.",
        );
      }
    }

    // Validate the delivery method + waiter allow-list before touching the DB.
    const deliveryMethod = delivery_method_id
      ? await this.resolveDeliveryMethod(delivery_method_id)
      : null;
    if (deliveryMethod) {
      await this.assertWaiterAllowedForDelivery();
    }
    if (safeOrganizationId) {
      await this.assertUserAllowedForOrganizationOrder(
        finalCashierId || finalWaiterId || employee_id,
      );
    }

    const allowLowStock = await this.isLowStockAllowed();

    const createdOrder = await db.transaction(async (tx: any) => {
      const order_number = await this.nextOrderNumber(tx, requireBranchId());
      const [order] = await tx
        .insert(orders)
        .values({
          ...tenantInsert(),
          ...(orderData.id ? { id: orderData.id } : {}),
          order_number,
          customer_id: customer_id || randomUUID(),
          employee_id,
          waiter_id: finalWaiterId,
          cashier_id: finalCashierId,
          table_number: safeTableNumber,
          organization_id: safeOrganizationId,
          is_price_override: Boolean(is_price_override),
          type,
          delivery_method_id: deliveryMethod?.id ?? null,
          total_amount,
          status: "pending",
          notes,
          meta: this.buildOrgCustomerMeta(
            org_customer_name,
            org_customer_phone,
            org_customer_notes,
          ),
        })
        .returning();

      if (deliveryMethod) {
        await tx.insert(deliveryOrderDetails).values({
          ...tenantInsert(),
          order_id: order.id,
          delivery_method_id: deliveryMethod.id,
          delivery_method_name: deliveryMethod.display_name,
          status: "pending",
        });
      }

      if (items && items.length > 0) {
        await tx
          .insert(order_items)
          .values(this.mapOrderItems(items, order.id));
      }

      // Stock is reserved the moment an order is placed, not when it's paid —
      // cancelling later reverses this same movement (see updateStatus).
      const insertedItems = await this.loadOrderItems(order.id, undefined, tx);
      if (insertedItems.length > 0) {
        await this.orderInventoryService.reconcileOrderItems({
          tx,
          orderId: order.id,
          previousItems: [],
          nextItems: insertedItems,
          createdBy: employee_id || finalWaiterId || null,
          allowLowStock,
        });
      }

      return order;
    });

    if (createdOrder) {
      const fullOrder = await this.findById(createdOrder.id);
      if (fullOrder) {
        await emitCreated(db, "order", "ORDER_CREATED", fullOrder as any);
        // Push to any cashier/kitchen clients watching this branch in real time.
        this.ordersGateway.notifyNewOrder(
          (fullOrder as any).branch_id,
          fullOrder,
        );
      }
      return fullOrder;
    }

    return null;
  }

  private async syncOrder(
    orderData: any,
    validUserIds: Set<string>,
    syncUserId: string,
    tx: any,
    existingOrdersById: Map<
      string,
      { id: string; status: string | null; branch_id: string }
    >,
  ) {
    const {
      id,
      employee_id,
      waiter_id,
      created_by_id,
      cashier_id,
      customer_id,
      table_number,
      items,
      total_amount,
      notes,
      status,
      payment_status,
      created_at,
      organization_id,
      org_customer_name,
      org_customer_phone,
      org_customer_notes,
      is_price_override,
      delivery_method_id,
    } = orderData;
    const type = delivery_method_id ? "delivery" : orderData.type;

    const finalEmployeeId = this.validateUserId(
      employee_id,
      validUserIds,
      syncUserId,
    );

    if (!finalEmployeeId) {
      console.warn(
        `[BulkSync] Skipping order ${id}: employee_id ${employee_id} not found in valid users`,
      );
      // Report the skip so the client keeps this order unsynced and retries it
      // later (e.g. once its employee has synced) instead of silently dropping it.
      return { id, skipped: true as const };
    }
    const finalWaiterId = this.validateUserId(
      waiter_id,
      validUserIds,
      finalEmployeeId,
    );
    // Cashier-placed orders carry a creator distinct from the waiter; keep it
    // only when it's a known user and actually differs from the waiter.
    const incomingCashierId =
      cashier_id ||
      (created_by_id && created_by_id !== finalWaiterId ? created_by_id : null);
    const finalCashierId = incomingCashierId
      ? this.validateUserId(incomingCashierId, validUserIds)
      : null;
    const safeTableNumber = delivery_method_id
      ? null
      : this.normalizeTableNumber(table_number);
    const safeOrganizationId = this.normalizeOrganizationId(organization_id);

    // The id existence check must NOT be branch-scoped: `orders.id` is a global
    // primary key, so an id can only ever belong to one row regardless of
    // branch. Scoping this by branch_id produced false negatives for orders that
    // already exist under another tenant (e.g. seed-tenant leftovers re-synced
    // into a real branch), which then fell through to an INSERT and crashed the
    // whole bulk-sync batch with a duplicate-key (orders_pkey) violation.
    //
    // Pre-fetched once for the whole batch by bulkSync (one inArray SELECT)
    // instead of one SELECT per order here — every id in a batch is distinct,
    // so a snapshot taken before the per-order loop starts is exact.
    const existingOrder = id ? existingOrdersById.get(id) : undefined;

    // Same id, but the row lives under a different branch — almost always a
    // seed/template order carrying a reused PK. Don't touch it and don't try to
    // re-insert it; report it as persisted so the client stops retrying.
    if (existingOrder && existingOrder.branch_id !== requireBranchId()) {
      console.warn(
        `[BulkSync] Order ${id} already exists under branch ${existingOrder.branch_id}, not ${requireBranchId()}; treating as persisted to avoid a duplicate-key crash.`,
      );
      return { id, exists: true as const };
    }

    if (existingOrder) {
      // Lifecycle priority: cancelled (terminal) > done > pending. Only update
      // the existing order if the incoming status outranks the current one.
      // Legacy clients may still send overloaded values (paid/voided/...); fold
      // them into the canonical vocab before comparing.
      const incomingStatus = normalizeOrderStatus(status);
      const existingStatus = normalizeOrderStatus(existingOrder.status);
      const incomingPriority = ORDER_STATUS_PRIORITY[incomingStatus];
      const existingPriority = ORDER_STATUS_PRIORITY[existingStatus];

      if (incomingPriority > existingPriority) {
        const isVoid = incomingStatus === "cancelled";
        // A legacy "paid" lifecycle implied money was collected; derive the
        // payment axis from it when the client didn't send one explicitly.
        const legacyPaid = String(status || "").toLowerCase() === "paid";
        await tx
          .update(orders)
          .set({
            status: incomingStatus,
            payment_status: isVoid
              ? "cancelled"
              : payment_status
                ? normalizePaymentStatus(payment_status)
                : legacyPaid
                  ? "paid"
                  : undefined,
            updated_at: new Date(),
          })
          .where(
            and(eq(orders.id, id), eq(orders.branch_id, requireBranchId())),
          );
        if (isVoid) {
          // Stock was reserved when this order was first synced (see below);
          // cancelling it now — same as the online cancel path — gives it back.
          const currentItems = await this.loadOrderItems(id, undefined, tx);
          try {
            await this.orderInventoryService.reconcileOrderItems({
              tx,
              orderId: id,
              previousItems: currentItems,
              nextItems: [],
              createdBy: finalEmployeeId || null,
            });
          } catch (error) {
            console.warn(
              `[BulkSync] Inventory reversal failed for cancelled order ${id}`,
              (error as Error)?.message,
            );
          }

          // Void this order's payments too, matching the online cancel path, so
          // no "paid" payment lingers for a cancelled order.
          await tx
            .update(payments)
            .set({ status: "cancelled", updated_at: new Date() })
            .where(
              and(
                eq(payments.order_id, id),
                eq(payments.branch_id, requireBranchId()),
              ),
            );
        }
        console.log(
          `[BulkSync] Updated existing order ${id} status: "${existingStatus}" → "${incomingStatus}"`,
        );
      } else if (incomingStatus !== existingStatus) {
        console.log(
          `[BulkSync] Skipping status downgrade for order ${id}: "${existingStatus}" (existing) ≥ "${incomingStatus}" (incoming)`,
        );
      }

      // Already on the server — report it as persisted so the client can safely
      // mark it synced (idempotent re-push).
      return { id, exists: true as const };
    }

    // Offline POS orders arrive carrying the serial already printed on their
    // tickets — that number is honored (web orders holding it get renumbered).
    // Payloads without a serial (online creates, legacy clients) keep getting
    // one from the branch counter.
    const requestedNumber = Number(orderData.order_number);
    const claim =
      Number.isInteger(requestedNumber) && requestedNumber > 0
        ? await this.claimClientOrderNumber(
            tx,
            requireBranchId(),
            requestedNumber,
          )
        : {
            order_number: await this.nextOrderNumber(tx, requireBranchId()),
            client_numbered: false,
          };
    // Same validation as the online create() path — a stale/disabled/foreign
    // method id, or a waiter outside the allow-list, must never persist.
    const deliveryMethod = delivery_method_id
      ? await this.resolveDeliveryMethod(delivery_method_id)
      : null;
    if (deliveryMethod) {
      await this.assertWaiterAllowedForDelivery();
    }
    if (safeOrganizationId) {
      await this.assertUserAllowedForOrganizationOrder(
        finalCashierId || finalWaiterId || finalEmployeeId,
      );
    }

    const order_number = claim.order_number;
    const [createdOrder] = await tx
      .insert(orders)
      .values({
        ...tenantInsert(),
        id,
        order_number,
        customer_id: customer_id || randomUUID(),
        employee_id: finalEmployeeId,
        waiter_id: finalWaiterId,
        cashier_id: finalCashierId,
        table_number: safeTableNumber,
        organization_id: safeOrganizationId,
        is_price_override: Boolean(is_price_override),
        type: type || "cafe",
        delivery_method_id: deliveryMethod?.id ?? null,
        total_amount,
        status: normalizeOrderStatus(status),
        // Delivery orders are paid through delivery_payments, never the normal
        // payments table — leave the payment axis untouched (null) for them.
        payment_status: deliveryMethod
          ? null
          : payment_status
            ? normalizePaymentStatus(payment_status)
            : String(status || "").toLowerCase() === "paid"
              ? "paid"
              : "pending",
        notes,
        created_at: created_at ? new Date(created_at) : new Date(),
        // client_numbered marks serials owned by an offline POS ticket so a
        // later claim never renumbers them out from under the printed copy.
        meta: {
          ...(claim.client_numbered ? { client_numbered: true } : {}),
          ...this.buildOrgCustomerMeta(
            org_customer_name,
            org_customer_phone,
            org_customer_notes,
          ),
        },
      })
      .returning();

    if (deliveryMethod) {
      await tx.insert(deliveryOrderDetails).values({
        ...tenantInsert(),
        order_id: createdOrder.id,
        delivery_method_id: deliveryMethod.id,
        delivery_method_name: deliveryMethod.display_name,
        status: "pending",
      });
    }

    if (items && items.length > 0) {
      // First: filter out items with non-UUID menu_item_ids
      const validItems = items.filter((item: any) => {
        const menuItemId = item.menu_item_id;
        if (menuItemId === null || menuItemId === undefined) return true;
        if (typeof menuItemId === "string" && this.isValidUUID(menuItemId))
          return true;
        console.warn(
          `[BulkSync] Skipping item with invalid menu_item_id: ${menuItemId}`,
        );
        return false;
      });

      // Collect all referenced menu_item_ids and check which ones exist in the DB
      const referencedMenuItemIds = validItems
        .map((item: any) => item.menu_item_id)
        .filter((id: any) => id != null && id !== "");

      const existingMenuItemIds = new Set<string>();
      if (referencedMenuItemIds.length > 0) {
        const existingRows = await tx
          .select({ id: menuItems.id })
          .from(menuItems)
          .where(inArray(menuItems.id, referencedMenuItemIds));
        existingRows.forEach((r: any) => existingMenuItemIds.add(r.id));
      }

      const orderItemsToInsert = validItems.map((item: any) => {
        const menuItemId =
          item.menu_item_id && item.menu_item_id !== ""
            ? item.menu_item_id
            : null;
        // If the menu_item_id doesn't exist in DB, set to null to avoid FK violation
        const safeMenuItemId =
          menuItemId && existingMenuItemIds.has(menuItemId) ? menuItemId : null;
        if (menuItemId && !safeMenuItemId) {
          console.warn(
            `[BulkSync] menu_item_id ${menuItemId} not found in DB — setting to null for order item`,
          );
        }
        return {
          ...tenantInsert(),
          id: item.id || randomUUID(),
          order_id: createdOrder.id,
          menu_item_id: safeMenuItemId,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal:
            Number(item.subtotal) ||
            Number(item.unit_price) * Number(item.quantity),
          item_type: item.item_type || "food",
          main_category: item.main_category,
          note: item.note || null,
        };
      });

      if (orderItemsToInsert.length > 0) {
        try {
          await tx.insert(order_items).values(orderItemsToInsert);
        } catch (insertErr) {
          console.error(
            `[BulkSync] Failed to insert order_items for order ${createdOrder.id}:`,
            (insertErr as Error)?.message,
          );
        }
      }
    }

    // Pre-register any local item-addition audit records the client sent
    // alongside this order. This matters for an order that was created AND
    // had items added to it while fully offline: by the time it reaches this
    // first sync, `items` above already reflects those additions merged in
    // (the device applies them locally, independent of network state) — so
    // if the same addition later arrives again via the dedicated
    // POST /orders/:id/items push (which every local item-addition
    // independently retries until confirmed), addOrderItems would have no
    // record of it and would add its delta a SECOND time on top of what was
    // just inserted above, silently doubling the quantity. Registering the
    // same addition_id here — the same idempotency key that push already
    // carries — makes addOrderItems recognize and skip it when it arrives.
    const incomingAdditions = Array.isArray(orderData.item_additions)
      ? orderData.item_additions
      : [];
    for (const addition of incomingAdditions) {
      if (!addition?.id || !Array.isArray(addition.items)) continue;
      try {
        await tx.insert(order_item_additions).values({
          id: addition.id,
          ...tenantInsert(),
          order_id: createdOrder.id,
          added_by:
            this.validateUserId(addition.added_by, validUserIds) ||
            finalEmployeeId,
          items: addition.items,
        });
      } catch (err) {
        // Non-fatal, and expected on a retried sync (the id already exists).
        console.warn(
          `[BulkSync] Failed to pre-register item addition ${addition.id} for order ${createdOrder.id}`,
          (err as Error)?.message,
        );
      }
    }

    // Stock is reserved the moment an order is placed, whether or not it's
    // paid yet — same as the online create() path. Offline POS orders only
    // reach the backend once they sync, so this is where that reservation
    // actually lands for them. Skip it entirely for an order that arrives
    // already cancelled: it never held stock, so there's nothing to reserve.
    const arrivedCancelled = normalizeOrderStatus(status) === "cancelled";
    if (!arrivedCancelled) {
      const syncedItems = await this.loadOrderItems(
        createdOrder.id,
        undefined,
        tx,
      );
      try {
        await this.orderInventoryService.reconcileOrderItems({
          tx,
          orderId: createdOrder.id,
          previousItems: [],
          nextItems: syncedItems,
          createdBy: finalEmployeeId || null,
          allowLowStock: true,
        });
      } catch (error) {
        console.warn(
          `[BulkSync] Inventory reconciliation failed for order ${createdOrder.id}; order is still logged.`,
          (error as Error)?.message,
        );
      }
    }

    return { id: createdOrder.id, order_number };
  }

  /**
   * Manual, on-demand repair tool for the offline-sync split between orders
   * and payments. `syncOrder` above (INSERT branch) honors a client-supplied
   * `payment_status: "paid"` on a brand-new order immediately, on the trust
   * that the matching payment row will follow — but orders and payments are
   * ALWAYS pushed as separate, independently-retried requests
   * (push-tasks.ts: ordersPushTask sends `payments: []` every time; the
   * actual payment row arrives later via paymentsPushTask). Normally that
   * gap closes within seconds. It stays open forever if the local payment
   * row was never created on the device to begin with — e.g. the app was
   * killed between writing the payment and flipping the order, or a local
   * write silently failed (local SQLite has no working transactions, see
   * payments.adapter.ts) — leaving an order permanently marked "paid" with
   * no payment ever recorded against it. Found exactly this on 2026-08-06
   * (13 orders, ~7.5k ETB) for two waiters' devices at LebuCafe/Branch1.
   *
   * There is deliberately no scheduler calling this automatically — a
   * missing local payment row has nothing queued anywhere to retry, so no
   * amount of waiting closes the gap on its own, but auto-inserting
   * financial records on a timer was judged riskier than it's worth. This is
   * invoked on demand (POST /orders/reconcile-orphan-payments) after a
   * manual audit turns up a gap, same as the 2026-08-06 backfill.
   *
   * Finds orders that have been "paid" for longer than `graceMinutes`
   * (comfortably past any in-flight payment push) with no matching
   * non-cancelled payment row, and backfills one so the ledger matches what
   * the order already claims. The payment *method* can't be recovered after
   * the fact, so it's recorded as "unreconciled" rather than guessed, and
   * the row is clearly flagged in `meta` for a human to verify later.
   *
   * Race safety: even run manually, a real payment sync for the same order
   * could land at the same moment (e.g. a device reconnects mid-audit). Each
   * candidate is re-verified inside its own transaction after taking `FOR
   * UPDATE` on the order row — the same lock syncPayment and
   * PaymentService.create take before their own duplicate checks — so
   * whichever writer gets there first for a given order completes its whole
   * check-then-write before another can even read; they can never both
   * decide "no payment yet" and both insert one. If a real payment already
   * won that race by the time this re-checks, the order is simply skipped.
   * (The reverse order — this backfill wins, then a real payment arrives
   * later — is handled on the other side, in syncPayment's and
   * PaymentService.create's duplicate checks: they supersede an
   * auto-reconciled placeholder instead of treating it as a genuine
   * duplicate.)
   */
  async reconcileOrphanPaidOrders(graceMinutes = 10): Promise<{
    checked: number;
    reconciled: Array<{
      order_id: string;
      order_number: number | null;
      payment_id: string;
      amount: number;
    }>;
  }> {
    const branchId = requireBranchId();
    const cutoff = new Date(Date.now() - graceMinutes * 60 * 1000);

    // Unlocked discovery pass — just narrows down which orders are worth
    // taking a lock for. Re-verified for real, under lock, below.
    const candidates = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.branch_id, branchId),
          eq(orders.payment_status, "paid"),
          lte(orders.updated_at, cutoff),
          sql`NOT EXISTS (
            SELECT 1 FROM ${payments}
            WHERE ${payments.order_id} = ${orders.id}
              AND ${payments.status} <> 'cancelled'
          )`,
        ),
      );

    const reconciled: Array<{
      order_id: string;
      order_number: number | null;
      payment_id: string;
      amount: number;
    }> = [];

    for (const candidate of candidates) {
      const inserted = await db.transaction(async (tx: any) => {
        const [order] = await tx
          .select({
            id: orders.id,
            branch_id: orders.branch_id,
            order_number: orders.order_number,
            total_amount: orders.total_amount,
            payment_status: orders.payment_status,
            employee_id: orders.employee_id,
            cashier_id: orders.cashier_id,
            updated_at: orders.updated_at,
          })
          .from(orders)
          .where(and(eq(orders.id, candidate.id), eq(orders.branch_id, branchId)))
          .for("update");
        if (!order || order.payment_status !== "paid") return null;

        // Re-check under lock: the unlocked discovery pass above could be
        // stale by the time this transaction runs — a real payment sync may
        // have won the race and already inserted one.
        const [existing] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(
            and(eq(payments.order_id, order.id), ne(payments.status, "cancelled")),
          )
          .limit(1);
        if (existing) return null;

        const amount = Number(order.total_amount ?? 0);
        const paidAt = order.updated_at ?? new Date();
        const [payment] = await tx
          .insert(payments)
          .values({
            business_id: requireBusinessId(),
            branch_id: order.branch_id,
            order_id: order.id,
            amount,
            amount_cents: amount,
            method: "unreconciled",
            payment_method: "unreconciled",
            status: "paid",
            processed_by: order.cashier_id || order.employee_id || null,
            paid_at: paidAt,
            created_at: paidAt,
            description:
              "Auto-reconciled: order was marked paid during sync but no payment record ever arrived. Method could not be recovered — verify with staff and correct if known.",
            meta: {
              auto_reconciled: true,
              reconciliation_reason: "missing_payment_row_after_sync",
              reconciled_at: new Date().toISOString(),
            },
          })
          .returning();

        return { payment, order };
      });

      if (!inserted) continue;

      const { payment, order } = inserted;
      console.warn(
        `[Reconcile] Backfilled payment ${payment.id} for orphaned paid order ${order.id} (#${order.order_number}), amount ${payment.amount}`,
      );
      await emitCreated(db, "payment", "PAYMENT_CREATED", payment as any);
      reconciled.push({
        order_id: order.id,
        order_number: order.order_number,
        payment_id: payment.id,
        amount: Number(payment.amount ?? 0),
      });
    }

    return { checked: candidates.length, reconciled };
  }

  private async syncPayment(
    paymentData: any,
    validUserIds: Set<string>,
    syncUserId: string,
    tx: any,
  ) {
    const {
      id,
      order_id,
      amount,
      payment_method,
      status,
      processed_by,
      paid_at,
      created_at,
      description,
    } = paymentData;

    if (!order_id) {
      console.warn(`[BulkSync] Skipping payment ${id}: no order_id provided`);
      return { id, persisted: false as const };
    }

    // Row-locked: reconcileOrphanPaidOrders takes the same lock on this order
    // before it backfills a placeholder payment, so whichever of "this real
    // sync" or "the reconciliation sweep" gets here first for a given order
    // finishes its whole check-then-insert before the other can even read —
    // no window where both see "no payment yet" and both insert one. See
    // reconcileOrphanPaidOrders for the full race this closes.
    const [verifiedOrder] = await tx
      .select({ id: orders.id, total_amount: orders.total_amount })
      .from(orders)
      .where(
        and(eq(orders.id, order_id), eq(orders.branch_id, requireBranchId())),
      )
      .for("update");
    if (!verifiedOrder) {
      // The order hasn't landed on the backend yet — very possibly because
      // its own sync is still in flight or got skipped this same cycle
      // (ordersPushTask and paymentsPushTask push independently; there is no
      // guarantee the order's push has been *processed* by the time this
      // payment's push reaches the server, only that it was attempted
      // first). Reporting `persisted: false` here is the whole point of this
      // return shape: it tells the client to keep retrying instead of
      // marking this payment synced on the strength of an HTTP 200 that
      // doesn't actually mean this row was written. Getting this wrong is
      // exactly how 2026-08-06's 13 orphaned "paid" orders happened — the
      // order eventually synced (already carrying payment_status: "paid"
      // from local state) while the payment that was supposed to back it up
      // got silently dropped here and the client believed it had synced.
      console.warn(
        `[BulkSync] Skipping payment ${id}: Order ${order_id} not found in DB.`,
      );
      return { id, persisted: false as const };
    }

    const finalProcessedBy = this.validateUserId(
      processed_by,
      validUserIds,
      syncUserId,
    );

    // A payment row only exists because money was confirmed, so it is never
    // "pending": fold any legacy/pending value to paid (or cancelled).
    const resolvedStatus = normalizePaymentRowStatus(status);

    // Idempotency guard against duplicate payments for the same order. The
    // onConflictDoUpdate below only dedups by payment `id`; two pushes with
    // DIFFERENT ids but the same order_id (a re-appearing order paid twice, or
    // two devices) would otherwise both insert and double-count revenue. Skip
    // this push when a non-cancelled payment already exists for the order.
    //
    // This only applies to full-order payments. The web cashier portal settles
    // an order across several department-scoped rows (meta.scope = "department"),
    // which are legitimately multiple payments per order and must not be blocked.
    const isDepartmentScoped =
      String((paymentData?.meta as any)?.scope || "") === "department";
    if (resolvedStatus !== "cancelled" && !isDepartmentScoped) {
      const [duplicate] = await tx
        .select({ id: payments.id, meta: payments.meta })
        .from(payments)
        .where(
          and(
            eq(payments.order_id, order_id),
            eq(payments.branch_id, requireBranchId()),
            ne(payments.id, id),
            ne(payments.status, "cancelled"),
            sql`coalesce(${payments.meta} ->> 'scope', '') <> 'department'`,
          ),
        )
        .limit(1);
      if (duplicate) {
        // An auto-reconciled placeholder (see reconcileOrphanPaidOrders) isn't
        // a real duplicate — it's a stand-in written because this exact
        // payment hadn't arrived yet. Now it has: void the placeholder and
        // let the real payment take its place as the authoritative row,
        // rather than permanently keeping the guessed-at placeholder and
        // silently dropping the real payment data that just showed up.
        if ((duplicate.meta as any)?.auto_reconciled === true) {
          await tx
            .update(payments)
            .set({
              status: "cancelled",
              updated_at: new Date(),
              meta: {
                ...(duplicate.meta as any),
                superseded_by: id,
                superseded_reason: "real_payment_synced_late",
              },
            })
            .where(eq(payments.id, duplicate.id));
          console.log(
            `[BulkSync] Payment ${id}: superseding auto-reconciled placeholder ${duplicate.id} for order ${order_id} with the real synced payment.`,
          );
        } else {
          // A genuine duplicate: the money is already recorded, just under a
          // different payment id — this row is redundant, not lost, so it's
          // safe (and correct) for the client to stop retrying it.
          console.warn(
            `[BulkSync] Skipping payment ${id}: order ${order_id} already has payment ${duplicate.id} (duplicate).`,
          );
          return { id, persisted: true as const };
        }
      }
    }

    // No verbal-discount / partial-payment concept exists in this POS — a
    // full-order payment always settles the order's exact total. Rather than
    // trusting whatever `amount` the offline client queued (which let an
    // order close as fully "paid" for any amount at all), derive the
    // authoritative amount server-side from the order itself, same as
    // settleDepartment derives its figure from order_items instead of
    // accepting a client-supplied one. A disagreeing client amount is
    // flagged in `meta` for visibility in the web payments history, but
    // never changes what's actually recorded as collected.
    let finalAmount = Number(amount);
    let amountMeta: Record<string, any> = {};
    if (resolvedStatus === "paid" && !isDepartmentScoped) {
      const orderTotal = Number(verifiedOrder?.total_amount ?? 0);
      finalAmount = orderTotal;
      if (Number(amount) !== orderTotal) {
        amountMeta = {
          amount_mismatch: true,
          client_sent_amount: amount,
          order_total_at_payment: orderTotal,
        };
      }
    }

    const resolvedPaidAt = paid_at ? new Date(paid_at) : new Date();

    await tx
      .insert(payments)
      .values({
        ...tenantInsert(),
        id,
        order_id,
        amount: finalAmount,
        amount_cents: finalAmount,
        payment_method,
        method: payment_method,
        status: resolvedStatus,
        processed_by: finalProcessedBy,
        paid_at: resolvedPaidAt,
        created_at: resolvedPaidAt,
        description: description || null,
        meta: amountMeta,
      })
      // A payment can reach the server twice: once as "pending" when it is
      // first created online, then again as "paid" after it is confirmed (the
      // dedicated confirm call can fail or race). Without this upsert the
      // second push hits a primary-key conflict (409) and the corrected status
      // is silently dropped, leaving a confirmed order stuck as "pending".
      .onConflictDoUpdate({
        target: payments.id,
        set: {
          status: resolvedStatus,
          payment_method,
          method: payment_method,
          processed_by: finalProcessedBy,
          paid_at: resolvedPaidAt,
          updated_at: new Date(),
        },
      });

    if (resolvedStatus === "paid") {
      // A cancellation is terminal. If this order was voided (e.g. by the web
      // cashier) while an offline POS still held it as paid, the late-syncing
      // "paid" payment must NOT resurrect the order. Keep it cancelled, void this
      // stray payment so it doesn't count as revenue, and skip the stock sale.
      const [orderRow] = await tx
        .select({ status: orders.status })
        .from(orders)
        .where(
          and(eq(orders.id, order_id), eq(orders.branch_id, requireBranchId())),
        )
        .limit(1);

      if (normalizeOrderStatus(orderRow?.status) === "cancelled") {
        await tx
          .update(payments)
          .set({ status: "cancelled", updated_at: new Date() })
          .where(eq(payments.id, id));
        console.log(
          `[BulkSync] Order ${order_id} is cancelled; not marking paid from synced payment ${id} (payment voided).`,
        );
        return { id, persisted: true as const };
      }

      // Payment is the completion event in this POS, so it closes the order:
      // lifecycle -> done, money -> paid. Stock was already reserved when the
      // order itself was synced (see syncOrder), so no deduction happens here.
      await tx
        .update(orders)
        .set({ status: "done", payment_status: "paid", updated_at: new Date() })
        .where(
          and(eq(orders.id, order_id), eq(orders.branch_id, requireBranchId())),
        );
    }

    return { id, persisted: true as const };
  }

  async bulkSync(data: any) {
    const {
      orders: rawOrders = [],
      payments: rawPayments = [],
      user_id: syncUserId,
    } = data;
    const syncOrders = this.dedupeById(rawOrders, "order");
    const syncPayments = this.dedupeById(rawPayments, "payment");

    console.log(
      `[OrderService] Starting bulk sync: ${syncOrders.length} orders, ${syncPayments.length} payments`,
    );

    const userRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.business_id, requireBusinessId()));
    const validUserIds = new Set(userRows.map((u) => u.id));

    // Pre-fetch every incoming order id's current row (if any) in one query
    // instead of a SELECT per order inside the per-order loop below — mirrors
    // the existingMenuItemIds batching further down for item validation.
    const incomingOrderIds = syncOrders
      .map((o: any) => o?.id)
      .filter((id: any): id is string => Boolean(id));
    const existingOrderRows = incomingOrderIds.length
      ? await db
          .select({ id: orders.id, status: orders.status, branch_id: orders.branch_id })
          .from(orders)
          .where(inArray(orders.id, incomingOrderIds))
      : [];
    const existingOrdersById = new Map(
      existingOrderRows.map((row) => [row.id, row]),
    );

    // `orders` keeps its original shape (newly-created orders + assigned serial)
    // for the immediate-create path. `persisted_ids` lists every order the
    // server is guaranteed to be holding (created OR already-present) so the
    // client only marks those as synced; `skipped_ids` are the ones it must keep
    // unsynced and retry — this is what prevents offline orders from vanishing.
    const orderResults: Array<{ id: string; order_number: number }> = [];
    const persistedIds: string[] = [];
    const skippedIds: string[] = [];
    const paymentsPersistedIds: string[] = [];
    const paymentsSkippedIds: string[] = [];
    await db.transaction(async (tx: any) => {
      for (const orderData of syncOrders) {
        let result: any;
        try {
          // Run each order inside its own savepoint (nested transaction) so an
          // unexpected failure on one order rolls back only that order instead
          // of aborting — and re-poisoning — the entire batch. Without this, a
          // single bad row makes every other order in the push fail too, and the
          // client retries the same doomed batch forever.
          result = await tx.transaction((sp: any) =>
            this.syncOrder(orderData, validUserIds, syncUserId, sp, existingOrdersById),
          );
        } catch (error) {
          // The savepoint above already rolled back this attempt's own insert
          // (see NodePgTransaction.transaction: any throw issues `rollback to
          // savepoint` before rethrowing), so `tx` is guaranteed clean here —
          // safe to query again.
          const cause = (error as any)?.cause;
          const isDuplicateOrderId =
            cause?.code === "23505" && cause?.constraint === "orders_pkey";

          if (isDuplicateOrderId && orderData?.id) {
            // Lost a race against a concurrent bulk-sync of this exact same
            // order (e.g. an overlapping retry from the same or another
            // device) — some other attempt's insert won and already holds
            // this id. Recheck instead of reporting "skipped": that used to
            // tell the client this order never landed and get it retried
            // forever, even though it's actually already persisted under
            // whichever serial the winning attempt claimed.
            const [winner] = await tx
              .select({ id: orders.id, order_number: orders.order_number })
              .from(orders)
              .where(eq(orders.id, orderData.id))
              .limit(1);
            if (winner) {
              console.warn(
                `[OrderService] Order ${orderData.id} lost a concurrent bulk-sync race; another attempt already persisted it as #${winner.order_number} — reporting persisted, not skipped.`,
              );
              persistedIds.push(winner.id);
              if (winner.order_number != null) {
                orderResults.push({
                  id: winner.id,
                  order_number: winner.order_number,
                });
              }
              continue;
            }
          }

          console.error(
            `[OrderService] bulk sync failed for order ${orderData?.id}; skipping it so the rest of the batch still commits:`,
            this.describeSyncError(error),
          );
          if (orderData?.id) skippedIds.push(orderData.id);
          continue;
        }
        if (!result?.id) continue;
        if ("skipped" in result && result.skipped) {
          skippedIds.push(result.id);
          continue;
        }
        persistedIds.push(result.id);
        if ("order_number" in result && result.order_number != null) {
          orderResults.push({
            id: result.id,
            order_number: result.order_number,
          });
        }
      }

      for (const paymentData of syncPayments) {
        try {
          const result = await tx.transaction((sp: any) =>
            this.syncPayment(paymentData, validUserIds, syncUserId, sp),
          );
          // Mirrors the orders loop above: the client must only mark a
          // payment synced once the server confirms it actually holds it.
          // Before this, syncPayment's silent-skip branches (order not yet
          // synced, etc.) returned void — bulkSync as a whole still replied
          // 200 OK, and the client had nothing to tell it THIS payment
          // didn't land, so it marked it synced anyway. That gap is exactly
          // how 2026-08-06's 13 orphaned "paid" orders happened.
          if (result?.id != null) {
            if (result.persisted) {
              paymentsPersistedIds.push(String(result.id));
            } else {
              paymentsSkippedIds.push(String(result.id));
            }
          }
        } catch (error) {
          console.error(
            `[OrderService] bulk sync failed for payment ${paymentData?.id}; skipping it so the rest of the batch still commits:`,
            this.describeSyncError(error),
          );
          if (paymentData?.id) paymentsSkippedIds.push(String(paymentData.id));
        }
      }
    });

    if (skippedIds.length > 0) {
      console.warn(
        `[OrderService] bulk sync skipped ${skippedIds.length} order(s):`,
        skippedIds,
      );
    }
    if (paymentsSkippedIds.length > 0) {
      console.warn(
        `[OrderService] bulk sync skipped ${paymentsSkippedIds.length} payment(s):`,
        paymentsSkippedIds,
      );
    }

    return {
      orders: orderResults,
      persisted_ids: persistedIds,
      skipped_ids: skippedIds,
      payments_persisted_ids: paymentsPersistedIds,
      payments_skipped_ids: paymentsSkippedIds,
    };
  }

  async findById(id: string) {
    const [orderRow] = await db
      .select({
        order: orders,
        employee: users,
        cashier: cashierUsers,
      })
      .from(orders)
      .leftJoin(users, eq(orders.employee_id, users.id))
      .leftJoin(cashierUsers, eq(orders.cashier_id, cashierUsers.id))
      .where(and(eq(orders.id, id), eq(orders.branch_id, requireBranchId())))
      .limit(1);

    if (!orderRow) return null;

    const items = await this.loadOrderItems(id);
    return this.toOrderResponse(
      orderRow.order,
      orderRow.employee,
      items,
      orderRow.cashier,
    );
  }

  /** Only ever called by getOrdersForPayment below — a cash-payment queue, so
   * delivery/organization orders (never collected as cash; see their own
   * dedicated boards) are unconditionally excluded, not opt-in like the
   * exclude_delivery/exclude_organization filters on findAllPaged. */
  async findAll(filters: any) {
    const conditions = [
      eq(orders.branch_id, requireBranchId()),
      sql`${orders.delivery_method_id} is null`,
      sql`${orders.organization_id} is null`,
    ] as any[];
    if (filters.status) conditions.push(eq(orders.status, filters.status));
    if (filters.type) conditions.push(eq(orders.type, filters.type));
    if (filters.employee_id)
      conditions.push(eq(orders.employee_id, filters.employee_id));
    if (filters.table_number)
      conditions.push(eq(orders.table_number, filters.table_number));
    if (filters.date_from) {
      const dateFrom = new Date(filters.date_from);
      conditions.push(gte(orders.created_at, dateFrom));
    }
    if (filters.date_to) {
      const dateTo = new Date(filters.date_to);
      conditions.push(lte(orders.created_at, dateTo));
    }

    const rows = await db
      .select({
        order: orders,
        employee: users,
        cashier: cashierUsers,
      })
      .from(orders)
      .leftJoin(users, eq(orders.employee_id, users.id))
      .leftJoin(cashierUsers, eq(orders.cashier_id, cashierUsers.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(orders.created_at));

    // Batch-load every order's items in a single query and group in memory,
    // instead of one query per order (an N+1 that made this endpoint scale
    // linearly with the number of orders).
    const itemsByOrder = await this.loadItemsForOrders(
      rows.map((r) => r.order.id),
    );

    return rows.map((row) =>
      this.toOrderResponse(
        row.order,
        row.employee,
        itemsByOrder.get(row.order.id) ?? [],
        row.cashier,
      ),
    );
  }

  /**
   * Load order_items for many orders at once and bucket them by order_id.
   * Replaces per-order loadOrderItems calls in list endpoints.
   */
  private async loadItemsForOrders(
    orderIds: string[],
  ): Promise<Map<string, any[]>> {
    const byOrder = new Map<string, any[]>();
    if (orderIds.length === 0) return byOrder;

    const rows = await db
      .select({
        item: order_items,
        menu: menuItems,
      })
      .from(order_items)
      .leftJoin(menuItems, eq(order_items.menu_item_id, menuItems.id))
      .where(inArray(order_items.order_id, orderIds))
      .orderBy(asc(order_items.id));

    for (const row of rows) {
      const mapped = {
        ...row.item,
        menu_item_name: row.menu?.name,
        name: row.menu?.name ?? (row.item as any)?.name,
        main_category:
          row.item?.main_category ??
          row.menu?.main_category ??
          (row.menu as any)?.category,
      };
      const list = byOrder.get(row.item.order_id);
      if (list) list.push(mapped);
      else byOrder.set(row.item.order_id, [mapped]);
    }

    return byOrder;
  }

  /**
   * Expand a filter value into a Date. A bare yyyy-mm-dd is treated as a day
   * boundary (start or end) in the branch's own timezone — NOT the server
   * process's ambient one — so a single-day "to" still includes that whole
   * local day. See branch-timezone.ts for why this matters.
   */
  private parseDateBound(value: string, end: boolean, timeZone: string): Date {
    return parseDateBoundInZone(value, timeZone, end);
  }

  // Earliest order.created_at this caller's role may see, from the per-role
  // history lookback. null when unlimited or when there is no JWT role in
  // context (offline desktop POS enforces the window client-side).
  private async getHistoryLowerBound(): Promise<Date | null> {
    const role = getTenant()?.role ?? null;
    if (!role) return null;
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.branch_id, requireBranchId()),
          eq(systemSettings.key, HISTORY_LOOKBACK_SETTING_KEY),
        ),
      );
    const days = resolveLookbackDays(role, parseLookbackMap(row?.value ?? null));
    return historyLowerBoundDate(days);
  }

  /**
   * Paginated, date-windowed order list for the dashboard. Returns the page of
   * rows plus the total matching count and summary stats computed server-side
   * over the *whole* window (not just the page) so the stat cards stay correct.
   *
   * Pagination and the default date window are opt-in: a caller that passes
   * neither `page`/`limit` nor an explicit date range gets the full unwindowed
   * history (the behaviour the heavier aggregation pages still rely on).
   */
  async findAllPaged(filters: any) {
    const branchId = requireBranchId();
    const paginate = filters.page != null || filters.limit != null;
    const hasExplicitDates = filters.date_from != null || filters.date_to != null;

    const conditions = [eq(orders.branch_id, branchId)] as any[];

    // Per-role lookback: a restricted role (e.g. waiter) can never list orders
    // further back than its configured window, even without explicit dates.
    const lookbackLowerBound = await this.getHistoryLowerBound();

    // Default to a 30-day window only when paginating without explicit dates,
    // so the dashboard list never scans the whole history on first paint.
    let from: Date | null = null;
    let to: Date | null = null;
    if (hasExplicitDates || paginate || lookbackLowerBound) {
      const timeZone = await resolveBranchTimezone(branchId);
      to = filters.date_to
        ? this.parseDateBound(filters.date_to, true, timeZone)
        : new Date();
      from = filters.date_from
        ? this.parseDateBound(filters.date_from, false, timeZone)
        : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (lookbackLowerBound && (!from || from < lookbackLowerBound)) {
        from = lookbackLowerBound;
      }
      conditions.push(gte(orders.created_at, from));
      conditions.push(lte(orders.created_at, to));
    }

    if (filters.status) conditions.push(eq(orders.status, filters.status));
    if (filters.type) conditions.push(eq(orders.type, filters.type));
    if (filters.employee_id)
      conditions.push(eq(orders.employee_id, filters.employee_id));
    if (filters.table_number)
      conditions.push(eq(orders.table_number, filters.table_number));
    if (filters.paid === "paid")
      conditions.push(sql`${orders.payment_status} = 'paid'`);
    else if (filters.paid === "unpaid")
      conditions.push(sql`coalesce(${orders.payment_status}, '') <> 'paid'`);
    // Opt-in, used by the dashboard Orders page: delivery orders are tracked
    // on their own Deliveries board (own status, own payments ledger) and
    // never belong in the normal Orders list. Other callers of this method
    // (Reports, home stats, Items Sold, …) don't pass this and keep seeing
    // the full order history, delivery included.
    if (filters.exclude_delivery) {
      conditions.push(sql`${orders.delivery_method_id} is null`);
    }
    // Same opt-in shape as exclude_delivery: organization orders settle
    // through their own credit ledger, posted only once the owner confirms
    // (see confirmOrganizationOrderPayment) — never belong in the normal
    // Orders list either.
    if (filters.exclude_organization) {
      conditions.push(sql`${orders.organization_id} is null`);
    }

    const search = String(filters.search ?? "").trim().toLowerCase();
    if (search) {
      const like = `%${search}%`;
      conditions.push(sql`(
        lower(coalesce(${orders.status}, '')) like ${like}
        or lower(coalesce(${orders.type}, '')) like ${like}
        or lower(coalesce(${orders.payment_status}, '')) like ${like}
        or cast(${orders.order_number} as text) like ${like}
        or lower(
          coalesce(${users.first_name}, '') || ' ' || coalesce(${users.last_name}, '')
        ) like ${like}
        or lower(coalesce(${users.name}, '')) like ${like}
        or lower(coalesce(${users.username}, '')) like ${like}
      )`);
    }

    const where = and(...conditions);
    const paid = sql`${orders.payment_status} = 'paid'`;
    const notVoided = sql`${orders.status} <> 'cancelled'`;
    // Anything not yet paid counts as outstanding. Many orders only carry
    // status='pending' with an empty/null payment_status (they never went
    // through the payment axis), so keying off payment_status = 'pending'
    // alone drops them. Match the "unpaid" list filter: not paid, not voided.
    const unpaid = sql`coalesce(${orders.payment_status}, '') <> 'paid'`;

    const [agg] = await db
      .select({
        total: count(),
        collected: sql<number>`coalesce(sum(case when ${notVoided} and ${paid} then coalesce(${orders.total_amount}, 0) else 0 end), 0)`,
        outstanding: sql<number>`coalesce(sum(case when ${notVoided} and ${unpaid} then coalesce(${orders.total_amount}, 0) else 0 end), 0)`,
        pending: sql<number>`count(*) filter (where ${orders.status} = 'pending')`,
      })
      .from(orders)
      .leftJoin(users, eq(orders.employee_id, users.id))
      .where(where);

    const limit = Math.min(Math.max(Number(filters.limit) || 25, 1), 100);
    const page = Math.max(Number(filters.page) || 1, 1);

    // Whitelist of columns the client may sort by; anything else falls back to
    // the default newest-first ordering.
    const SORTABLE: Record<string, any> = {
      total_amount: orders.total_amount,
      created_at: orders.created_at,
      table_number: orders.table_number,
      order_number: orders.order_number,
    };
    const sortCol = SORTABLE[filters.sort_by as string];
    const dir = filters.sort_dir === "asc" ? asc : desc;
    const orderBy = sortCol
      ? [dir(sortCol), desc(orders.created_at)]
      : [desc(orders.created_at)];

    const baseQuery = db
      .select({ order: orders, employee: users, cashier: cashierUsers })
      .from(orders)
      .leftJoin(users, eq(orders.employee_id, users.id))
      .leftJoin(cashierUsers, eq(orders.cashier_id, cashierUsers.id))
      .where(where)
      .orderBy(...orderBy);

    const rows = paginate
      ? await baseQuery.limit(limit).offset((page - 1) * limit)
      : await baseQuery;

    const itemsByOrder = await this.loadItemsForOrders(
      rows.map((r) => r.order.id),
    );
    const list = rows.map((row) =>
      this.toOrderResponse(
        row.order,
        row.employee,
        itemsByOrder.get(row.order.id) ?? [],
        row.cashier,
      ),
    );

    return {
      orders: list,
      count: Number(agg?.total ?? 0),
      page: paginate ? page : 1,
      limit: paginate ? limit : Number(agg?.total ?? 0),
      window:
        from && to
          ? { from: from.toISOString(), to: to.toISOString() }
          : null,
      stats: {
        total_orders: Number(agg?.total ?? 0),
        collected: Number(agg?.collected ?? 0),
        outstanding: Number(agg?.outstanding ?? 0),
        pending: Number(agg?.pending ?? 0),
      },
    };
  }

  // ─── Organization order settlement ─────────────────────────────────────────

  /**
   * Owner-only approval of one organization-attributed order. This is where
   * the credit deduction actually happens — NOT at order creation. A cashier
   * attaching an order to an organization only records who it's for
   * (organization_id + org_customer_name in meta); nothing touches the
   * organization's account until the owner reviews and confirms it here,
   * which is when this posts the debit (a new org_credit_transactions row,
   * linked back to the order via its unique `order_id`) and decrements
   * `credit_balance`. Never touches the shared `payments` table, so an
   * organization order never counts toward today's revenue/pending either
   * way. `order_id` being unique on org_credit_transactions is what makes
   * this idempotent — confirming twice (or a retried request) fails cleanly
   * instead of double-charging the organization.
   */
  async confirmOrganizationOrderPayment(
    orderId: string,
    confirmedByUserId: string | null | undefined,
  ) {
    if (!confirmedByUserId) {
      throw new ForbiddenException("A confirming user is required.");
    }
    const [actor] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, confirmedByUserId))
      .limit(1);
    if (!isAllAccessRole(actor?.role)) {
      throw new ForbiddenException(
        "Only the owner can confirm an organization order.",
      );
    }

    const branchId = requireBranchId();
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.branch_id, branchId)))
      .limit(1);
    if (!order) throw new NotFoundException("Order not found");
    if (!order.organization_id) {
      throw new BadRequestException(
        "This order isn't attributed to an organization.",
      );
    }
    if (order.payment_status === "paid") {
      throw new BadRequestException("This order is already confirmed.");
    }

    const items = await this.loadOrderItems(orderId);
    const services = (items ?? []).map((item: any) => ({
      description: String(item.menu_item_name || item.menu_item_id || "Item"),
      cost:
        Number(item.subtotal) ||
        Number(item.unit_price || 0) * Number(item.quantity || 1),
    }));
    const total = String(Number(order.total_amount) || 0);

    return db.transaction(async (tx: any) => {
      try {
        await tx.insert(org_credit_transactions).values({
          ...tenantInsert(),
          organization_id: order.organization_id,
          order_id: orderId,
          services:
            services.length > 0
              ? services
              : [{ description: "Order", cost: Number(total) }],
          total_amount: total,
        });
      } catch (error) {
        const cause = (error as any)?.cause ?? error;
        if (cause?.code === "23505") {
          // Unique order_id violation: a concurrent/retried confirm already
          // posted this order's charge. Treat as already confirmed instead
          // of double-charging the organization.
          throw new BadRequestException("This order is already confirmed.");
        }
        throw error;
      }

      await tx
        .update(organizations)
        .set({
          credit_balance: sql`${organizations.credit_balance} - ${total}`,
          updated_at: new Date(),
        })
        .where(eq(organizations.id, order.organization_id as string));

      const [updatedOrder] = await tx
        .update(orders)
        .set({ payment_status: "paid", updated_at: new Date() })
        .where(eq(orders.id, orderId))
        .returning();

      return { order_id: orderId, order: updatedOrder };
    });
  }

  /**
   * Orders placed through a configured delivery method, for the dedicated
   * Deliveries tracking board — separate from the dine-in/take-away Orders
   * list. Branch-scoped like every other list here; optionally narrowed to a
   * single delivery status (pending/delivered/cancelled).
   */
  async listDeliveries(filters: { status?: string } = {}) {
    const conditions = [
      eq(orders.branch_id, requireBranchId()),
      sql`${orders.delivery_method_id} is not null`,
    ] as any[];
    if (filters.status) {
      conditions.push(eq(deliveryOrderDetails.status, filters.status));
    }

    const rows = await db
      .select({
        order: orders,
        employee: users,
        cashier: cashierUsers,
        detail: deliveryOrderDetails,
        method: deliveryMethods,
      })
      .from(orders)
      .innerJoin(
        deliveryOrderDetails,
        eq(deliveryOrderDetails.order_id, orders.id),
      )
      .leftJoin(deliveryMethods, eq(orders.delivery_method_id, deliveryMethods.id))
      .leftJoin(users, eq(orders.employee_id, users.id))
      .leftJoin(cashierUsers, eq(orders.cashier_id, cashierUsers.id))
      .where(and(...conditions))
      .orderBy(desc(orders.created_at));

    const orderIds = rows.map((r) => r.order.id);
    const itemsByOrder = await this.loadItemsForOrders(orderIds);
    const paymentsByOrder = await this.loadDeliveryPaymentsForOrders(orderIds);

    return rows.map((row) => {
      const orderPayments = paymentsByOrder.get(row.order.id) ?? [];
      const paidCents = orderPayments
        .filter((p) => p.status === "paid")
        .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
      return {
        ...this.toOrderResponse(
          row.order,
          row.employee,
          itemsByOrder.get(row.order.id) ?? [],
          row.cashier,
        ),
        delivery: {
          id: row.detail.id,
          method_id: row.method?.id ?? row.detail.delivery_method_id,
          method_name: row.method?.display_name ?? row.detail.delivery_method_name,
          method_icon: row.method?.icon ?? null,
          courier_name: row.detail.courier_name,
          courier_phone: row.detail.courier_phone,
          address: row.detail.address,
          fee_cents: row.detail.fee_cents,
          status: row.detail.status,
          notes: row.detail.notes,
          delivered_at: row.detail.delivered_at,
        },
        delivery_payments: orderPayments,
        delivery_payment_summary: {
          paid_cents: paidCents,
          // "paid" once collected money covers the order total; orders without
          // a total yet (still being built) never resolve as paid.
          is_paid:
            row.order.total_cents != null
              ? paidCents >= row.order.total_cents
              : paidCents > 0,
        },
      };
    });
  }

  private async loadDeliveryPaymentsForOrders(
    orderIds: string[],
  ): Promise<Map<string, any[]>> {
    const byOrder = new Map<string, any[]>();
    if (orderIds.length === 0) return byOrder;
    const rows = await db
      .select({ payment: deliveryPayments, processedBy: users })
      .from(deliveryPayments)
      .leftJoin(users, eq(deliveryPayments.processed_by, users.id))
      .where(inArray(deliveryPayments.order_id, orderIds))
      .orderBy(desc(deliveryPayments.created_at));
    for (const row of rows) {
      const mapped = {
        ...row.payment,
        processed_by_name: this.formatEmployeeName(row.processedBy),
      };
      const list = byOrder.get(row.payment.order_id);
      if (list) list.push(mapped);
      else byOrder.set(row.payment.order_id, [mapped]);
    }
    return byOrder;
  }

  /**
   * Record a delivery payment entry (e.g. cash the courier handed over, or a
   * platform's remittance). Never touches the shared `payments` table.
   */
  async addDeliveryPayment(orderId: string, data: any) {
    const branchId = requireBranchId();

    const status = data.status ? String(data.status) : "paid";
    if (!["pending", "paid", "cancelled"].includes(status)) {
      throw new BadRequestException("Choose a delivery payment status.");
    }

    // Two clients can both load the order as "still owing" before either
    // one's payment lands — e.g. the owner confirms from the web dashboard
    // while a POS client is showing a stale delivery list — and each submit
    // a full payment, double-booking the order. Lock the order row and
    // re-check the collected total under lock, same pattern as the payment
    // reconciliation job above, so only one of the two ever succeeds.
    const created = await db.transaction(async (tx: any) => {
      const [order] = await tx
        .select({
          id: orders.id,
          delivery_method_id: orders.delivery_method_id,
          total_amount: orders.total_amount,
        })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.branch_id, branchId)))
        .for("update");
      if (!order) throw new NotFoundException("Order not found.");
      if (!order.delivery_method_id) {
        throw new BadRequestException("This order has no delivery method attached.");
      }

      if (status === "paid") {
        const [{ paidCents }] = await tx
          .select({
            paidCents: sql<number>`coalesce(sum(${deliveryPayments.amount_cents}), 0)`,
          })
          .from(deliveryPayments)
          .where(
            and(
              eq(deliveryPayments.order_id, orderId),
              eq(deliveryPayments.status, "paid"),
            ),
          );

        const totalCents = Math.round(Number(order.total_amount ?? 0) * 100);
        if (totalCents > 0 && Number(paidCents) >= totalCents) {
          throw new BadRequestException("This order is already fully paid.");
        }
      }

      const [row] = await tx
        .insert(deliveryPayments)
        .values({
          ...tenantInsert(),
          order_id: orderId,
          delivery_method_id: order.delivery_method_id,
          amount_cents: Math.round(Number(data.amount_cents) || 0),
          status,
          method: data.method || null,
          processed_by: data.processed_by || null,
          notes: data.notes || null,
          paid_at: status === "paid" ? new Date() : null,
        })
        .returning();
      return row;
    });

    await emitCreated(db, "delivery_payment", "DELIVERY_PAYMENT_CREATED", created as any);
    return created;
  }

  async updateDeliveryPayment(orderId: string, paymentId: string, data: any) {
    const branchId = requireBranchId();
    const setFields: any = { updated_at: new Date() };
    if (data.amount_cents !== undefined) {
      setFields.amount_cents = Math.round(Number(data.amount_cents) || 0);
    }
    if (data.method !== undefined) setFields.method = data.method || null;
    if (data.notes !== undefined) setFields.notes = data.notes || null;
    if (data.status !== undefined) {
      const status = String(data.status);
      if (!["pending", "paid", "cancelled"].includes(status)) {
        throw new BadRequestException("Choose a delivery payment status.");
      }
      setFields.status = status;
      setFields.paid_at = status === "paid" ? new Date() : null;
    }

    const [updated] = await db
      .update(deliveryPayments)
      .set(setFields)
      .where(
        and(
          eq(deliveryPayments.id, paymentId),
          eq(deliveryPayments.order_id, orderId),
          eq(deliveryPayments.branch_id, branchId),
        ),
      )
      .returning();
    if (!updated) throw new NotFoundException("Delivery payment not found.");
    await emitUpdated(db, "delivery_payment", "DELIVERY_PAYMENT_UPDATED", updated as any);
    return updated;
  }

  /**
   * Update the delivery-specific fields for an order (courier, address, fee,
   * notes, and the delivery's own pending/delivered/cancelled progress).
   * Independent of orders.status — completing a delivery never touches the
   * kitchen/payment status, and vice versa.
   */
  async updateDeliveryDetails(orderId: string, data: any) {
    const branchId = requireBranchId();
    const [existing] = await db
      .select({ id: deliveryOrderDetails.id })
      .from(deliveryOrderDetails)
      .where(
        and(
          eq(deliveryOrderDetails.order_id, orderId),
          eq(deliveryOrderDetails.branch_id, branchId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new NotFoundException("This order has no delivery attached.");
    }

    const setFields: any = { updated_at: new Date() };
    if (data.courier_name !== undefined) setFields.courier_name = data.courier_name || null;
    if (data.courier_phone !== undefined) setFields.courier_phone = data.courier_phone || null;
    if (data.address !== undefined) setFields.address = data.address || null;
    if (data.fee_cents !== undefined) setFields.fee_cents = Number(data.fee_cents) || 0;
    if (data.notes !== undefined) setFields.notes = data.notes || null;
    if (data.status !== undefined) {
      const status = String(data.status);
      if (!["pending", "delivered", "cancelled"].includes(status)) {
        throw new BadRequestException("Choose a delivery status.");
      }
      setFields.status = status;
      setFields.delivered_at = status === "delivered" ? new Date() : null;
    }

    const [updated] = await db
      .update(deliveryOrderDetails)
      .set(setFields)
      .where(eq(deliveryOrderDetails.id, existing.id))
      .returning();
    await emitUpdated(db, "delivery_order", "DELIVERY_ORDER_UPDATED", updated as any);
    return updated;
  }

  /**
   * Back-office cancellation. Only a still-open (pending) order may be voided:
   * once it's done/paid or already cancelled, cancelling is rejected so the
   * back office can't reverse a completed sale out from under the POS. The
   * status check and the void run in one place; the actual voiding (payments,
   * stock, realtime push) is delegated to updateStatus.
   */
  async cancelOrder(id: string, updatedBy?: any) {
    const branchId = requireBranchId();
    const [existing] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.branch_id, branchId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException("Order not found.");
    }
    if (normalizeOrderStatus(existing.status) !== "pending") {
      throw new BadRequestException(
        "Only a pending order can be cancelled.",
      );
    }

    return this.updateStatus(id, "cancelled", updatedBy);
  }

  async updateStatus(id: string, status: string, updatedBy?: any) {
    const branchId = requireBranchId();
    const nextStatus = normalizeOrderStatus(status);
    const isCancel = nextStatus === "cancelled";

    const updated = await db.transaction(async (tx: any) => {
      const [existingOrder] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.branch_id, branchId)))
        .limit(1);

      // Cancelling voids the order: also clear any paid/partially-paid state so
      // the back-office and POS don't keep showing it as "paid" (they key off
      // payment_status), and so it leaves every cashier queue.
      const setFields: any = { status: nextStatus, updated_at: new Date() };
      if (isCancel) setFields.payment_status = "cancelled";

      const [updated] = await tx
        .update(orders)
        .set(setFields)
        .where(and(eq(orders.id, id), eq(orders.branch_id, branchId)))
        .returning();

      if (updated) {
        // Stock is reserved as soon as an order is placed (see create()), paid
        // or not — so cancelling always reverses it, not just paid orders.
        if (
          isCancel &&
          normalizeOrderStatus(existingOrder?.status) !== "cancelled"
        ) {
          const currentItems = await this.loadOrderItems(id, undefined, tx);
          await this.orderInventoryService.reconcileOrderItems({
            tx,
            orderId: id,
            previousItems: currentItems,
            nextItems: [],
            createdBy: updatedBy || null,
          });
        }

        // Void every payment on a cancelled order so it stops counting as paid /
        // as revenue anywhere (payments page, recent-payments panel, reports).
        // Without this the original "paid" payment lingers and the POS — which
        // reads payments from the backend — keeps showing the order as paid.
        if (isCancel) {
          await tx
            .update(payments)
            .set({ status: "cancelled", updated_at: new Date() })
            .where(
              and(
                eq(payments.order_id, id),
                eq(payments.branch_id, branchId),
              ),
            );
        }

        await this.logStatusChange(id, nextStatus, updatedBy);
        const full = await this.findById(id);
        if (full) {
          await emitUpdated(tx, "order", "ORDER_UPDATED", full as any);
        }
      }

      return updated;
    });

    // Realtime push so a POS — which reads orders from its own local DB — reflects
    // the cancellation/status change instantly instead of waiting for a sync pull.
    if (updated) {
      try {
        const full = await this.findById(id);
        if (full) {
          this.ordersGateway.notifyOrderUpdated((full as any).branch_id, full);
        }
      } catch (err) {
        console.warn(
          `[OrderService] Realtime order push failed for order ${id}`,
          (err as Error)?.message,
        );
      }
    }

    return updated;
  }

  async getStatusHistory(id: string) {
    const rows = await db
      .select({
        log: orderStatusLogs,
        user: users,
      })
      .from(orderStatusLogs)
      .leftJoin(users, eq(orderStatusLogs.changed_by, users.id))
      .where(
        and(
          eq(orderStatusLogs.order_id, id),
          eq(orderStatusLogs.branch_id, requireBranchId()),
        ),
      )
      .orderBy(desc(orderStatusLogs.changed_at));

    return rows.map((row: any) => ({
      ...row.log,
      changed_by_name: this.formatEmployeeName(row.user),
    }));
  }

  async getPendingOrders(type?: string) {
    const conditions = [
      eq(orders.branch_id, requireBranchId()),
      eq(orders.status, "pending"),
    ] as any[];
    if (type) conditions.push(eq(orders.type, type));

    const rows = await db
      .select({
        order: orders,
        employee: users,
        cashier: cashierUsers,
      })
      .from(orders)
      .leftJoin(users, eq(orders.employee_id, users.id))
      .leftJoin(cashierUsers, eq(orders.cashier_id, cashierUsers.id))
      .where(and(...conditions))
      .orderBy(asc(orders.created_at));

    const itemsByOrder = await this.loadItemsForOrders(
      rows.map((r) => r.order.id),
    );
    return rows.map((row) =>
      this.toOrderResponse(
        row.order,
        row.employee,
        itemsByOrder.get(row.order.id) ?? [],
        row.cashier,
      ),
    );
  }

  async getReadyOrders(type?: string) {
    const conditions = [
      eq(orders.branch_id, requireBranchId()),
      eq(orders.status, "done"),
    ] as any[];
    if (type) conditions.push(eq(orders.type, type));

    const rows = await db
      .select({
        order: orders,
        employee: users,
      })
      .from(orders)
      .leftJoin(users, eq(orders.employee_id, users.id))
      .where(and(...conditions))
      .orderBy(asc(orders.updated_at));

    const itemsByOrder = await this.loadItemsForOrders(
      rows.map((r) => r.order.id),
    );
    return rows.map((row) =>
      this.toOrderResponse(
        row.order,
        row.employee,
        itemsByOrder.get(row.order.id) ?? [],
      ),
    );
  }

  async createCafeOrder(data: any) {
    return this.create({ ...data, type: "cafe" });
  }

  async getKitchenOrders() {
    const rows = await db
      .select({
        order: orders,
        employee: users,
      })
      .from(orders)
      .leftJoin(users, eq(orders.employee_id, users.id))
      .leftJoin(order_items, eq(orders.id, order_items.order_id))
      .where(
        and(
          eq(orders.branch_id, requireBranchId()),
          eq(orders.type, "cafe"),
          eq(orders.status, "pending"),
          eq(order_items.item_type, "food"),
        ),
      )
      .orderBy(asc(orders.created_at));

    const uniqueOrders = new Map<string, any>();
    for (const row of rows) {
      if (!uniqueOrders.has(row.order.id)) {
        const items = await this.loadOrderItems(row.order.id, "food");
        uniqueOrders.set(
          row.order.id,
          this.toOrderResponse(row.order, row.employee, items),
        );
      }
    }

    return Array.from(uniqueOrders.values());
  }

  async markOrderReady(id: string, updatedBy?: any) {
    // Lifecycle collapsed to {pending, done, cancelled}: "ready" is "done".
    const updated = await this.updateStatus(id, "done", updatedBy);
    return updated;
  }

  async completeOrder(id: string, completedBy?: any) {
    return this.updateStatus(id, "done", completedBy);
  }

  async getOrdersForPayment(filters: any) {
    return this.findAll(filters);
  }

  /**
   * Active orders awaiting payment, enriched for the web cashier portal with a
   * per-department breakdown so a department-attached cashier can settle only
   * their share. A "department" is the `main_category` carried on each order
   * item. When `departments` is provided, only orders that still have an
   * unsettled due in one of those departments are returned, and the item/dues
   * lists are trimmed to those departments so other departments' lines and
   * totals never leak to a scoped cashier.
   */
  async getCashierQueue(filters: { departments?: string[]; employee_id?: string }) {
    const branchId = requireBranchId();
    const wanted = (filters.departments ?? [])
      .map((d) => String(d || "").trim().toLowerCase())
      .filter(Boolean);

    const conditions = [
      eq(orders.branch_id, branchId),
      sql`coalesce(${orders.payment_status}, '') <> 'paid'`,
      sql`coalesce(${orders.status}, '') <> 'cancelled'`,
      // Delivery orders are paid through delivery_payments and tracked on the
      // Deliveries board, not the cashier's normal payment queue.
      sql`${orders.delivery_method_id} is null`,
      // Organization orders are never collected as cash — only the owner can
      // confirm one (see confirmOrganizationOrderPayment), which posts the
      // charge to the organization's credit ledger, not `payments`. A cashier
      // must never see one in their payment queue.
      sql`${orders.organization_id} is null`,
    ] as any[];
    if (filters.employee_id) {
      conditions.push(eq(orders.employee_id, filters.employee_id));
    }

    const rows = await db
      .select({ order: orders, employee: users })
      .from(orders)
      .leftJoin(users, eq(orders.employee_id, users.id))
      .where(and(...conditions))
      .orderBy(desc(orders.created_at));

    const orderIds = rows.map((r) => r.order.id);
    const itemsByOrder = await this.loadItemsForOrders(orderIds);

    // Departments already settled per order (paid department-scoped payments).
    const settledByOrder = new Map<string, Set<string>>();
    if (orderIds.length > 0) {
      const payRows = await db
        .select({ order_id: payments.order_id, meta: payments.meta })
        .from(payments)
        .where(
          and(
            eq(payments.branch_id, branchId),
            inArray(payments.order_id, orderIds),
            eq(payments.status, "paid"),
          ),
        );
      for (const p of payRows) {
        const meta = (p.meta ?? {}) as any;
        if (meta?.scope !== "department") continue;
        const dept = String(meta?.department || "").trim().toLowerCase();
        if (!dept) continue;
        const set = settledByOrder.get(p.order_id) ?? new Set<string>();
        set.add(dept);
        settledByOrder.set(p.order_id, set);
      }
    }

    const deptOf = (it: any) =>
      String(it?.main_category || "").trim().toLowerCase() || "other";

    const result: any[] = [];
    for (const row of rows) {
      const items = itemsByOrder.get(row.order.id) ?? [];
      const settled = settledByOrder.get(row.order.id) ?? new Set<string>();

      const dueMap = new Map<
        string,
        { department: string; subtotal: number; settled: boolean }
      >();
      for (const it of items) {
        const dept = deptOf(it);
        const cur =
          dueMap.get(dept) ??
          { department: dept, subtotal: 0, settled: settled.has(dept) };
        cur.subtotal += Number(it?.subtotal ?? 0) || 0;
        dueMap.set(dept, cur);
      }
      let dues = Array.from(dueMap.values());

      let visibleItems = items;
      if (wanted.length > 0) {
        dues = dues.filter((d) => wanted.includes(d.department));
        // Skip orders with nothing left for this cashier's departments.
        if (!dues.some((d) => !d.settled)) continue;
        visibleItems = items.filter((it) => wanted.includes(deptOf(it)));
      }

      result.push({
        ...this.toOrderResponse(row.order, row.employee, visibleItems),
        settled_departments: Array.from(settled),
        department_dues: dues,
      });
    }

    return result;
  }

  /**
   * Resolve who's actually calling, preferring the JWT-verified tenant identity
   * (web waiter/cashier portals send a Bearer token TenantMiddleware already
   * verifies — though the cashier portal in practice only sends a device
   * token, same as the desktop POS) and falling back to the client-supplied
   * `updatedBy` for device-token-only clients (the same trust level this
   * codebase already extends to them elsewhere, e.g. payments' `processed_by`).
   * Also resolves the caller's role (from the JWT when present, else looked up
   * alongside the `updatedBy` validation) so callers can apply role-based
   * exceptions to the ownership check below. Validates the fallback id
   * actually exists in `users` first, same guard `logStatusChange` already
   * applies, so a bogus id can't be used to spoof another user.
   */
  private async resolveEffectiveCaller(
    updatedBy?: any,
  ): Promise<{ id: string | null; role: string | null }> {
    const tenant = getTenant();
    if (tenant?.userId) return { id: tenant.userId, role: tenant.role ?? null };
    if (updatedBy == null) return { id: null, role: null };
    const [row] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, String(updatedBy)))
      .limit(1);
    return { id: row?.id ?? null, role: row?.role ?? null };
  }

  /**
   * Only the order's creator (whoever `toOrderResponse` reports as
   * `created_by_id` — the cashier who rang it up on a waiter's behalf when
   * present, else the waiter) may add/replace its items — this stops one
   * waiter editing another's order. Cashiers (and all-access roles) are
   * exempt: their job is managing the whole payment queue, which in practice
   * means orders a *waiter* created, so holding them to creator-only would
   * lock them out of the feature entirely. Lenient when the order's creator
   * or the caller's identity can't be resolved (legacy data, or a caller
   * without any identity signal) so this can't newly break a flow that
   * predates ownership tracking.
   */
  // Once an order is paid, its total is exactly what was collected. Adding
  // items afterward silently bumped total_amount with no corresponding
  // payment and no way for the payment to ever be collected — paid orders
  // are excluded from every "awaiting payment" list, so the top-up just
  // vanished. Block the edit outright; a customer ordering more after
  // paying gets a new order.
  //
  // Split out from the ownership check below (unlike that one, this half is
  // deliberately skippable — see reconcileOrderItems) so the two concerns
  // can be composed independently instead of only ever together.
  private assertOrderNotPaid(order: any) {
    if (normalizePaymentStatus(order?.payment_status) === "paid") {
      throw new BadRequestException(
        "This order has already been paid and can no longer be modified. Start a new order for additional items.",
      );
    }
  }

  private assertCallerOwnsOrder(
    order: any,
    caller: { id: string | null; role: string | null },
  ) {
    if (caller.role === "cashier" || isAllAccessRole(caller.role)) return;

    const creatorId = order?.cashier_id ?? order?.waiter_id ?? null;
    if (creatorId && caller.id && String(creatorId) !== String(caller.id)) {
      throw new ForbiddenException(
        "Only the staff member who created this order can add items to it.",
      );
    }
  }

  private assertCanModifyOrderItems(
    order: any,
    caller: { id: string | null; role: string | null },
  ) {
    this.assertOrderNotPaid(order);
    this.assertCallerOwnsOrder(order, caller);
  }

  async updateOrderItems(id: string, items: any[], updatedBy?: any) {
    const allowLowStock = await this.isLowStockAllowed();
    const branchId = requireBranchId();
    return db.transaction(async (tx: any) => {
      const [existingOrder] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.branch_id, branchId)))
        .limit(1);
      if (!existingOrder) return null;
      this.assertCanModifyOrderItems(
        existingOrder,
        await this.resolveEffectiveCaller(updatedBy),
      );
      const isCancelled =
        normalizeOrderStatus(existingOrder?.status) === "cancelled";
      const previousItems = await this.loadOrderItems(id, undefined, tx);
      await tx.delete(order_items).where(eq(order_items.order_id, id));

      let newTotal = 0;
      const newItems = items.map((item: any) => {
        const subtotal = Number(item.unit_price) * Number(item.quantity);
        newTotal += subtotal;
        return {
          ...tenantInsert(),
          order_id: id,
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal,
        };
      });

      if (newItems.length > 0) {
        await tx.insert(order_items).values(newItems);
      }

      const shouldRevertPaymentStatus =
        existingOrder?.payment_status === "paid" &&
        newTotal > Number(existingOrder.total_amount);

      await tx
        .update(orders)
        .set({
          total_amount: newTotal,
          ...(shouldRevertPaymentStatus ? { payment_status: "pending" } : {}),
          updated_at: new Date(),
        })
        .where(and(eq(orders.id, id), eq(orders.branch_id, branchId)));

      // Stock is reserved from the moment the order was placed, regardless of
      // payment status — so any item edit reconciles the delta unless the
      // order is already cancelled (its stock was already given back).
      if (!isCancelled) {
        const nextItems = await this.loadOrderItems(id, undefined, tx);
        await this.orderInventoryService.reconcileOrderItems({
          tx,
          orderId: id,
          previousItems,
          nextItems,
          createdBy: updatedBy || null,
          allowLowStock,
        });
      }

      return this.findById(id);
    });
  }

  async addOrderItems(
    id: string,
    items: any[],
    updatedBy?: any,
    additionId?: string,
  ) {
    return this.addOrderItemsInternal(id, items, updatedBy, additionId, {
      allowPaidOrder: false,
    });
  }

  /**
   * Same merge as addOrderItems, but for one narrow case: applying an
   * addition that was genuinely queued while the order was still open, but
   * only reached the backend after the order's payment had already synced
   * (see the pushTasks-ordering fix in the desktop client's sync engine —
   * that closes this for new additions going forward). The item really was
   * served before payment; addOrderItems' normal paid-order guard would
   * reject it forever and the addition — and the revenue it represents —
   * would just be lost, with no record it ever happened. This applies it so
   * the order's items/total_amount reflect what was actually served.
   *
   * Deliberately not reachable from the ordinary "Add Items" UI flow (no
   * client surface calls this route) — it exists solely for the sync
   * layer's own retry of a specifically-already-rejected addition. Skips
   * ONLY the paid-order check; the ownership check still applies.
   *
   * By design this does not adjust payment_status or flag the gap between
   * the new total_amount and what was actually collected — the order is
   * left looking fully paid. A future top-up for the difference has no
   * record prompting it.
   */
  async reconcileOrderItems(
    id: string,
    items: any[],
    updatedBy?: any,
    additionId?: string,
  ) {
    return this.addOrderItemsInternal(id, items, updatedBy, additionId, {
      allowPaidOrder: true,
    });
  }

  private async addOrderItemsInternal(
    id: string,
    items: any[],
    updatedBy: any,
    additionId: string | undefined,
    options: { allowPaidOrder: boolean },
  ) {
    const allowLowStock = await this.isLowStockAllowed();
    const branchId = requireBranchId();
    const caller = await this.resolveEffectiveCaller(updatedBy);

    const result = await db.transaction(async (tx: any) => {
      const [existingOrder] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.branch_id, branchId)))
        .limit(1);
      if (!existingOrder) return null;

      // Idempotent replay: a client-generated addition_id lets a retried call
      // (e.g. the desktop's offline queue replaying after a dropped response
      // that actually succeeded) be recognized as the same action instead of
      // being applied a second time. Checked/inserted inside this same
      // transaction so two concurrent retries can't both pass the check.
      // Checked BEFORE the paid-order guard below: a replay of an addition
      // that already landed while the order was still unpaid must stay a
      // no-op even if the order has since been paid — only a genuinely new
      // addition to an already-paid order should be rejected.
      if (additionId) {
        const [existingAddition] = await tx
          .select({ id: order_item_additions.id })
          .from(order_item_additions)
          .where(eq(order_item_additions.id, additionId))
          .limit(1);
        if (existingAddition) return this.findById(id);
      }

      if (!options.allowPaidOrder) this.assertOrderNotPaid(existingOrder);
      this.assertCallerOwnsOrder(existingOrder, caller);

      const isCancelled =
        normalizeOrderStatus(existingOrder?.status) === "cancelled";
      const previousItems = await this.loadOrderItems(id, undefined, tx);

      let additionalTotal = 0;
      // Snapshot of exactly what this call added — independent of the merge
      // below, which bumps an existing order_items row's running total rather
      // than recording the delta. This is what the audit trail and the
      // desktop's "added items" kitchen ticket both read from.
      const addedSnapshot: any[] = [];

      for (const item of items) {
        const [existingItem] = await tx
          .select()
          .from(order_items)
          .where(
            and(
              eq(order_items.order_id, id),
              eq(order_items.menu_item_id, item.menu_item_id),
            ),
          )
          .limit(1);

        const itemSubtotal = Number(item.unit_price) * Number(item.quantity);
        additionalTotal += itemSubtotal;
        addedSnapshot.push({
          menu_item_id: item.menu_item_id,
          menu_item_name: item.menu_item_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: itemSubtotal,
          item_type: item.item_type || "food",
          main_category: item.main_category,
        });

        if (existingItem) {
          const newQuantity =
            Number(existingItem.quantity) + Number(item.quantity);
          await tx
            .update(order_items)
            .set({
              quantity: newQuantity,
              subtotal: Number(item.unit_price) * newQuantity,
            })
            .where(
              and(
                eq(order_items.order_id, id),
                eq(order_items.menu_item_id, item.menu_item_id),
              ),
            );
        } else {
          await tx.insert(order_items).values({
            ...tenantInsert(),
            order_id: id,
            menu_item_id: item.menu_item_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: itemSubtotal,
            item_type: item.item_type || "food",
            main_category: item.main_category,
          });
        }
      }

      // Atomic increment (not read-then-write) so concurrent addOrderItems
      // calls for the same order — e.g. an offline queue flushing several
      // queued additions in parallel — can't clobber each other's total.
      await tx
        .update(orders)
        .set({
          total_amount: sql`${orders.total_amount} + ${additionalTotal}`,
          updated_at: new Date(),
        })
        .where(and(eq(orders.id, id), eq(orders.branch_id, branchId)));

      await tx.insert(order_item_additions).values({
        ...(additionId ? { id: additionId } : {}),
        ...tenantInsert(),
        order_id: id,
        added_by: caller.id,
        items: addedSnapshot,
      });

      if (!isCancelled) {
        const nextItems = await this.loadOrderItems(id, undefined, tx);
        await this.orderInventoryService.reconcileOrderItems({
          tx,
          orderId: id,
          previousItems,
          nextItems,
          createdBy: updatedBy || null,
          allowLowStock,
        });
      }

      return this.findById(id);
    });

    // Realtime push so a POS — which prints kitchen tickets from its own local
    // DB — can print the added items instantly instead of waiting for the next
    // catch-up pull. Best-effort: a socket failure shouldn't fail the request,
    // the pull task is the safety net.
    if (result) {
      try {
        const full = await this.findById(id);
        const [latestAddition] = await this.getItemAdditions(id);
        if (full && latestAddition) {
          this.ordersGateway.notifyItemsAdded((full as any).branch_id, {
            order: full,
            addition: latestAddition,
          });
        }
      } catch (err) {
        console.warn(
          `[OrderService] Realtime item-addition push failed for order ${id}`,
          (err as Error)?.message,
        );
      }
    }

    return result;
  }

  async getItemAdditions(orderId: string) {
    const rows = await db
      .select({
        addition: order_item_additions,
        user: users,
      })
      .from(order_item_additions)
      .leftJoin(users, eq(order_item_additions.added_by, users.id))
      .where(
        and(
          eq(order_item_additions.order_id, orderId),
          eq(order_item_additions.branch_id, requireBranchId()),
        ),
      )
      .orderBy(desc(order_item_additions.added_at));

    return rows.map((row: any) => ({
      ...row.addition,
      added_by_name: this.formatEmployeeName(row.user),
    }));
  }

  /** Branch-wide catch-up feed the desktop app's pull task polls after being
   * offline/closed, so it can print additions it missed the realtime push for. */
  async getItemAdditionsSince(dateFrom?: string) {
    const conditions = [
      eq(order_item_additions.branch_id, requireBranchId()),
    ] as any[];
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!isNaN(from.getTime())) {
        conditions.push(gte(order_item_additions.added_at, from));
      }
    }

    const rows = await db
      .select({
        addition: order_item_additions,
        user: users,
      })
      .from(order_item_additions)
      .leftJoin(users, eq(order_item_additions.added_by, users.id))
      .where(and(...conditions))
      .orderBy(desc(order_item_additions.added_at));

    return rows.map((row: any) => ({
      ...row.addition,
      added_by_name: this.formatEmployeeName(row.user),
    }));
  }

  async getOrdersByType(orderType: string) {
    const rows = await db
      .select({
        order: orders,
        employee: users,
      })
      .from(orders)
      .leftJoin(users, eq(orders.employee_id, users.id))
      .where(
        and(eq(orders.branch_id, requireBranchId()), eq(orders.type, "cafe")),
      );

    const filtered = rows.filter((row: any) => {
      if (orderType === "beverage_only") {
        return row.order.status === "done";
      }
      if (orderType === "kitchen") {
        return row.order.status === "pending";
      }
      return true;
    });

    const ordersWithItems = [] as any[];
    for (const row of filtered) {
      const items = await this.loadOrderItems(row.order.id);
      const beverageCount = items.filter(
        (item: any) => item.item_type === "beverage",
      ).length;
      const foodCount = items.filter(
        (item: any) => item.item_type === "food",
      ).length;
      ordersWithItems.push({
        ...this.toOrderResponse(row.order, row.employee, items),
        beverage_count: beverageCount,
        food_count: foodCount,
        order_composition:
          foodCount > 0 && beverageCount > 0
            ? "mixed"
            : beverageCount > 0
              ? "beverage_only"
              : "food_only",
      });
    }

    return ordersWithItems;
  }

  async markFoodReady(id: string) {
    await this.markFoodItemsReady(id);
    return this.findById(id);
  }

  async getOccupiedTables() {
    const rows = await db
      .select({
        order: orders,
        employee: users,
      })
      .from(orders)
      .leftJoin(users, eq(orders.employee_id, users.id))
      .where(
        and(
          eq(orders.branch_id, requireBranchId()),
          eq(orders.type, "cafe"),
          // Active orders still holding a table: everything not yet finished
          // or cancelled. With the collapsed lifecycle that is just "pending".
          eq(orders.status, "pending"),
        ),
      )
      .orderBy(asc(orders.table_number));

    return rows
      .filter((row: any) => row.order.table_number != null)
      .map((row: any) => ({
        table_number: row.order.table_number,
        order_id: row.order.id,
        status: row.order.status,
        waiter_name: this.formatEmployeeName(row.employee),
      }));
  }

  private async logStatusChange(
    orderId: string,
    status: string,
    updatedBy?: any,
  ) {
    // changed_by has an FK to users; an id that isn't a user row (e.g. a
    // back-office owner acting from the web dashboard who isn't in the branch's
    // users table) would throw and abort the whole status-change transaction.
    // Fall back to null so the cancel/complete still commits.
    let changedBy: string | null = null;
    if (updatedBy != null) {
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, String(updatedBy)))
        .limit(1);
      changedBy = row?.id ?? null;
    }
    await db.insert(orderStatusLogs).values({
      ...tenantInsert(),
      order_id: orderId,
      status,
      changed_by: changedBy,
    });
  }

  private async markFoodItemsReady(orderId: string) {
    const order = await this.findById(orderId);
    if (!order) return;
    // "ready" collapsed into the "done" lifecycle state.
    await this.updateStatus(orderId, "done");
  }

  private async loadOrderItems(
    orderId: string,
    itemType?: string,
    client: any = db,
  ) {
    const conditions = [eq(order_items.order_id, orderId)] as any[];
    if (itemType) conditions.push(eq(order_items.item_type, itemType));

    const rows = await client
      .select({
        item: order_items,
        menu: menuItems,
      })
      .from(order_items)
      .leftJoin(menuItems, eq(order_items.menu_item_id, menuItems.id))
      .where(and(...conditions))
      .orderBy(asc(order_items.id));

    return rows.map((row: any) => ({
      ...row.item,
      menu_item_name: row.menu?.name,
      name: row.menu?.name ?? row.item?.name,
      main_category:
        row.item?.main_category ??
        row.menu?.main_category ??
        row.menu?.category,
    }));
  }

  private toOrderResponse(
    order: any,
    employee: any,
    items: any[],
    cashier?: any,
  ) {
    // Surface who placed the order so clients can show "Cashier" vs "Waiter" vs
    // "Owner". cashier_id is only set when a cashier rang up an order on a
    // waiter's behalf. Orders placed straight from the back office (owner/admin
    // web dashboard) carry no cashier and no real waiter — the attributed
    // employee IS a back-office user — so tag them "owner" instead of falsely
    // labelling the owner a waiter.
    const orderSource = order?.cashier_id
      ? "cashier"
      : OrderService.BACK_OFFICE_ROLES.has(employee?.role)
        ? "owner"
        : "waiter";
    return {
      ...order,
      // Mirror cashier_id into created_by_id so existing clients (which key off
      // created_by_id !== waiter_id) keep working for server-fetched orders.
      created_by_id:
        order?.created_by_id ?? order?.cashier_id ?? order?.waiter_id ?? null,
      order_source: orderSource,
      employee_name: this.formatEmployeeName(employee),
      employee_role: employee?.role ?? null,
      // Name/role of whoever placed the order on the waiter's behalf, when
      // applicable. Null for orders a waiter placed for themselves. The role
      // lets clients label the placer as "Owner" (back office) vs "Cashier".
      cashier_name: this.formatEmployeeName(cashier),
      cashier_role: cashier?.role ?? null,
      items,
    };
  }

  private formatEmployeeName(employee: any) {
    if (!employee) return null;
    // Branch staff (waiters/cashiers) carry first_name/last_name, but owners and
    // admin-panel users are created with only the `name` (and username) columns
    // populated. Fall back through those so back-office-placed orders still show
    // who created them instead of a blank name.
    const composed = [employee.first_name, employee.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    return composed || employee.name || employee.username || null;
  }
}
