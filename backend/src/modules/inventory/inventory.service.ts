import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { and, asc, eq, sql, inArray, or, like, ilike, gte, lte } from "drizzle-orm";
import { db } from "../../db/drizzle";
import {
  inventoryItems,
  inventoryItemLinks,
  stockMovements,
  stockTransfers,
  stockTransferItems,
  inventoryStock,
  stockLocations,
  recipes,
  recipeIngredients,
  menuItems,
  orders,
  users,
} from "../../db/schema";
import { emitCreated, emitDeleted, emitUpdated } from "../sync/sync-emit.util";
import { requireBranchId, tenantInsert } from "../../common/tenant/tenant-context";
import { SettingsService } from "../settings/settings.service";
import { RolePermissionsService } from "../role-permissions/role-permissions.service";

const numberOrZero = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly rolePermissions: RolePermissionsService,
  ) {}

  /** Throws unless `allowed` is unrestricted (null) or contains `locationId`. */
  private assertLocationAllowed(
    allowed: string[] | null,
    locationId: string | null | undefined,
  ) {
    if (allowed !== null && (!locationId || !allowed.includes(locationId))) {
      throw new ForbiddenException(
        "Your role does not have access to this stock location.",
      );
    }
  }

  async findAll(page: number = 1, limit: number = 50, search?: string) {
    const offset = (page - 1) * limit;
    const allowedLocations = await this.rolePermissions.getAllowedLocations("inventory");

    // Build search condition, always scoped to the active branch
    const branchCondition = eq(inventoryItems.branch_id, requireBranchId());
    const whereCondition = search
      ? and(
          branchCondition,
          or(
            like(inventoryItems.name, `%${search}%`),
            like(inventoryItems.notes, `%${search}%`),
          ),
        )
      : branchCondition;

    // Get total count first
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryItems)
      .where(whereCondition);

    // Get paginated items
    const items = await db
      .select()
      .from(inventoryItems)
      .where(whereCondition)
      .orderBy(asc(inventoryItems.name))
      .limit(limit)
      .offset(offset);

    // Fetch stock for these items only, restricted to the caller's allowed
    // stock locations (null = unrestricted; [] = restricted to none).
    const itemIds = items.map(item => item.id);
    const stockRows =
      allowedLocations !== null && allowedLocations.length === 0
        ? []
        : await db
            .select({
              id: inventoryStock.id,
              inventory_item_id: inventoryStock.inventory_item_id,
              location_id: inventoryStock.location_id,
              location_name: stockLocations.name,
              quantity: inventoryStock.quantity,
              min_quantity: inventoryStock.min_quantity,
            })
            .from(inventoryStock)
            .innerJoin(
              stockLocations,
              eq(inventoryStock.location_id, stockLocations.id),
            )
            .where(
              allowedLocations !== null
                ? and(
                    inArray(inventoryStock.inventory_item_id, itemIds),
                    inArray(inventoryStock.location_id, allowedLocations),
                  )
                : inArray(inventoryStock.inventory_item_id, itemIds),
            );

    // Group stock by inventory item id
    const stockMap = new Map<string, any[]>();
    for (const row of stockRows) {
      if (!stockMap.has(row.inventory_item_id)) {
        stockMap.set(row.inventory_item_id, []);
      }
      stockMap.get(row.inventory_item_id)!.push({
        location_id: row.location_id,
        location_name: row.location_name,
        quantity: row.quantity,
        min_quantity: row.min_quantity,
      });
    }

    // Attach transfer-link info: `transfer_link` when this item is a link
    // source (it is received as the target when transferred) and
    // `linked_sources` for items that convert into this one.
    const links = await this.getBranchLinks();
    const itemsWithStock = items.map((item) => ({
      ...item,
      stock_by_location: stockMap.get(item.id) || [],
      transfer_link: links.find((l) => l.source_item_id === item.id) ?? null,
      linked_sources: links.filter((l) => l.target_item_id === item.id),
    }));

    return {
      items: itemsWithStock,
      count: Number(count),
      page,
      limit,
      totalPages: Math.ceil(Number(count) / limit),
    };
  }

  async findOne(id: string) {
    const branchId = requireBranchId();
    const allowedLocations = await this.rolePermissions.getAllowedLocations("inventory");
    const [item] = await db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, id), eq(inventoryItems.branch_id, branchId)))
      .limit(1);

    if (!item) throw new NotFoundException("Inventory item not found");

    const stockRows =
      allowedLocations !== null && allowedLocations.length === 0
        ? []
        : await db
            .select({
              location_id: inventoryStock.location_id,
              location_name: stockLocations.name,
              quantity: inventoryStock.quantity,
              min_quantity: inventoryStock.min_quantity,
            })
            .from(inventoryStock)
            .innerJoin(
              stockLocations,
              eq(inventoryStock.location_id, stockLocations.id),
            )
            .where(
              allowedLocations !== null
                ? and(
                    eq(inventoryStock.inventory_item_id, id),
                    eq(inventoryStock.branch_id, branchId),
                    inArray(inventoryStock.location_id, allowedLocations),
                  )
                : and(
                    eq(inventoryStock.inventory_item_id, id),
                    eq(inventoryStock.branch_id, branchId),
                  ),
            );

    const links = await this.getBranchLinks();
    return {
      ...item,
      stock_by_location: stockRows,
      transfer_link: links.find((l) => l.source_item_id === item.id) ?? null,
      linked_sources: links.filter((l) => l.target_item_id === item.id),
    };
  }

  // All links for the active branch with item names attached — a branch holds
  // few links, so one fetch serves the list, item, and transfer shapes.
  private async getBranchLinks() {
    const links = await db
      .select()
      .from(inventoryItemLinks)
      .where(eq(inventoryItemLinks.branch_id, requireBranchId()));
    if (links.length === 0) return [];

    const itemIds = Array.from(
      new Set(links.flatMap((l) => [l.source_item_id, l.target_item_id])),
    );
    const names = await db
      .select({ id: inventoryItems.id, name: inventoryItems.name })
      .from(inventoryItems)
      .where(inArray(inventoryItems.id, itemIds));
    const nameById = new Map(names.map((n) => [n.id, n.name]));

    return links.map((l) => ({
      ...l,
      source_item_name: nameById.get(l.source_item_id) ?? null,
      target_item_name: nameById.get(l.target_item_id) ?? null,
    }));
  }

  async findLinks() {
    return { links: await this.getBranchLinks() };
  }

  async createLink(payload: any) {
    const sourceId = String(payload.source_item_id || "");
    const targetId = String(payload.target_item_id || "");
    const factorRaw = Number(payload.conversion_factor);
    const factor =
      Number.isFinite(factorRaw) && factorRaw >= 1 ? Math.round(factorRaw) : 1;

    if (!sourceId || !targetId) {
      throw new BadRequestException("Choose both items.");
    }
    if (sourceId === targetId) {
      throw new BadRequestException("Choose two different items.");
    }

    const branchId = requireBranchId();
    const pair = await db
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(
        and(
          inArray(inventoryItems.id, [sourceId, targetId]),
          eq(inventoryItems.branch_id, branchId),
        ),
      );
    if (!pair.some((i) => i.id === sourceId))
      throw new NotFoundException("Source item not found");
    if (!pair.some((i) => i.id === targetId))
      throw new NotFoundException("Target item not found");

    // Keep the topology a one-level star: a target may not itself convert into
    // something else and a source may not also receive links — otherwise a
    // transfer would have to chase link chains.
    const existing = await db
      .select()
      .from(inventoryItemLinks)
      .where(eq(inventoryItemLinks.branch_id, branchId));
    if (existing.some((l) => l.source_item_id === targetId)) {
      throw new BadRequestException(
        "Target item is itself linked to another item — chained links are not allowed",
      );
    }
    if (existing.some((l) => l.target_item_id === sourceId)) {
      throw new BadRequestException(
        "Source item already receives other linked items — chained links are not allowed",
      );
    }

    const current = existing.find((l) => l.source_item_id === sourceId);
    if (current) {
      const [updated] = await db
        .update(inventoryItemLinks)
        .set({
          target_item_id: targetId,
          conversion_factor: factor,
          updated_at: new Date(),
        })
        .where(eq(inventoryItemLinks.id, current.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(inventoryItemLinks)
      .values({
        ...tenantInsert(),
        source_item_id: sourceId,
        target_item_id: targetId,
        conversion_factor: factor,
      })
      .returning();
    return created;
  }

  async deleteLink(id: string) {
    const [deleted] = await db
      .delete(inventoryItemLinks)
      .where(
        and(
          eq(inventoryItemLinks.id, id),
          eq(inventoryItemLinks.branch_id, requireBranchId()),
        ),
      )
      .returning();
    if (!deleted) throw new NotFoundException("Item link not found");
    return deleted;
  }

  // Base transfer row shape shared by the list and the single-transfer detail
  // fetch — includes location and actor names so neither caller needs a
  // second round trip just to show who moved stock where.
  private transferSelection() {
    return {
      id: stockTransfers.id,
      from_location_id: stockTransfers.from_location_id,
      from_location_name: sql<string>`(select name from stock_locations where id = ${stockTransfers.from_location_id})`,
      to_location_id: stockTransfers.to_location_id,
      to_location_name: sql<string>`(select name from stock_locations where id = ${stockTransfers.to_location_id})`,
      status: stockTransfers.status,
      notes: stockTransfers.notes,
      created_by: stockTransfers.created_by,
      created_by_name: sql<string>`(select name from users where id = ${stockTransfers.created_by})`,
      received_by: stockTransfers.received_by,
      received_by_name: sql<string>`(select name from users where id = ${stockTransfers.received_by})`,
      received_at: stockTransfers.received_at,
      meta: stockTransfers.meta,
      created_at: stockTransfers.created_at,
      updated_at: stockTransfers.updated_at,
    };
  }

  // Attaches, to each transfer, its line items (with item names) and the
  // exact stock balance at the source/destination locations right before and
  // after the transfer — the "ledger" view of a transfer.
  private async attachTransferItems<T extends { id: string }>(
    transfers: T[],
  ): Promise<(T & { items: any[]; item_count: number; total_quantity: number })[]> {
    const transferIds = transfers.map((t) => t.id);
    if (transferIds.length === 0) {
      return transfers.map((t) => ({ ...t, items: [], item_count: 0, total_quantity: 0 }));
    }

    const items = await db
      .select({
        id: stockTransferItems.id,
        transfer_id: stockTransferItems.transfer_id,
        inventory_item_id: stockTransferItems.inventory_item_id,
        item_name: inventoryItems.name,
        base_unit: inventoryItems.base_unit,
        quantity: stockTransferItems.quantity,
        meta: stockTransferItems.meta,
        created_at: stockTransferItems.created_at,
      })
      .from(stockTransferItems)
      .innerJoin(
        inventoryItems,
        eq(stockTransferItems.inventory_item_id, inventoryItems.id),
      )
      .where(inArray(stockTransferItems.transfer_id, transferIds))
      .orderBy(asc(stockTransferItems.created_at));

    // Fetch movements for these transfers to get quantity_before/after at the
    // time of transfer.
    const movements = await db
      .select({
        id: stockMovements.id,
        transfer_id: stockMovements.transfer_id,
        inventory_item_id: stockMovements.inventory_item_id,
        movement_type: stockMovements.movement_type,
        location_id: stockMovements.location_id,
        quantity_delta: stockMovements.quantity_delta,
        quantity_after: stockMovements.quantity_after,
        created_at: stockMovements.created_at,
      })
      .from(stockMovements)
      .where(inArray(stockMovements.transfer_id, transferIds));

    // Group movements by transfer_id and inventory_item_id
    const movementsMap = new Map<string, Map<string, any[]>>();
    for (const m of movements) {
      if (!m.transfer_id) continue;
      if (!movementsMap.has(m.transfer_id)) {
        movementsMap.set(m.transfer_id, new Map());
      }
      const itemMap = movementsMap.get(m.transfer_id)!;
      if (!m.inventory_item_id) continue;
      if (!itemMap.has(m.inventory_item_id)) {
        itemMap.set(m.inventory_item_id, []);
      }
      itemMap.get(m.inventory_item_id)!.push(m);
    }

    return transfers.map((transfer) => {
      const transferItems = items.filter((item) => item.transfer_id === transfer.id);
      const itemMovementsMap = movementsMap.get(transfer.id) || new Map();

      const itemsWithMovements = transferItems.map((item) => {
        const itemMovements = itemMovementsMap.get(item.inventory_item_id) || [];
        const transferOut = itemMovements.find((m: any) => m.movement_type === "transfer_out");
        // Linked lines are received as a different item, so their transfer_in
        // movement is recorded under the link target's item id. Several lines
        // may share one target — match by the credited quantity, falling back
        // to the first movement when no delta matches.
        const meta = (item.meta as any) || {};
        const receivedAs = meta.received_as;
        const receivedQty = meta.received_quantity;
        const inMovements = receivedAs
          ? itemMovementsMap.get(receivedAs) || []
          : itemMovements;
        const transferIn =
          (receivedAs
            ? inMovements.find(
                (m: any) =>
                  m.movement_type === "transfer_in" &&
                  m.quantity_delta === receivedQty,
              )
            : undefined) ?? inMovements.find((m: any) => m.movement_type === "transfer_in");

        return {
          ...item,
          received_as_item_id: receivedAs ?? null,
          received_as_name: meta.received_as_name ?? null,
          received_quantity: receivedQty ?? null,
          conversion_factor: meta.conversion_factor ?? 1,
          source_location_id: transferOut?.location_id ?? null,
          source_quantity_after: transferOut?.quantity_after ?? null,
          source_quantity_before:
            transferOut?.quantity_after != null
              ? transferOut.quantity_after - transferOut.quantity_delta
              : null,
          destination_location_id: transferIn?.location_id ?? null,
          destination_quantity_after: transferIn?.quantity_after ?? null,
          destination_quantity_before:
            transferIn?.quantity_after != null
              ? transferIn.quantity_after - transferIn.quantity_delta
              : null,
        };
      });

      return {
        ...transfer,
        items: itemsWithMovements,
        item_count: itemsWithMovements.length,
        total_quantity: itemsWithMovements.reduce(
          (sum, i) => sum + numberOrZero(i.quantity),
          0,
        ),
      };
    });
  }

  async findTransfers(
    page: number = 1,
    limit: number = 10,
    filters: { status?: string; search?: string } = {},
  ) {
    const branchId = requireBranchId();
    const allowedLocations = await this.rolePermissions.getAllowedLocations("transfers");
    if (allowedLocations !== null && allowedLocations.length === 0) {
      return {
        transfers: [],
        count: 0,
        page,
        limit,
        totalPages: 0,
        stats: { total: 0, sent: 0, received: 0, cancelled: 0, total_quantity: 0 },
      };
    }
    // A role restricted to specific locations only sees transfers touching at
    // least one of them, on either end.
    const locationCondition =
      allowedLocations !== null
        ? or(
            inArray(stockTransfers.from_location_id, allowedLocations),
            inArray(stockTransfers.to_location_id, allowedLocations),
          )
        : undefined;
    const branchCondition = locationCondition
      ? and(eq(stockTransfers.branch_id, branchId), locationCondition)!
      : eq(stockTransfers.branch_id, branchId);

    // Status breakdown + total volume moved are computed over the whole
    // branch history (not just the current page) for the summary cards.
    const statusRows = await db
      .select({
        status: stockTransfers.status,
        count: sql<number>`count(*)`,
      })
      .from(stockTransfers)
      .where(branchCondition)
      .groupBy(stockTransfers.status);
    const stats = {
      total: 0,
      sent: 0,
      received: 0,
      cancelled: 0,
      total_quantity: 0,
    };
    for (const row of statusRows) {
      stats.total += Number(row.count);
      if (row.status === "sent") stats.sent = Number(row.count);
      else if (row.status === "received") stats.received = Number(row.count);
      else if (row.status === "cancelled") stats.cancelled = Number(row.count);
    }

    const [{ totalQuantity }] = await db
      .select({
        totalQuantity: sql<number>`coalesce(sum(${stockTransferItems.quantity}), 0)`,
      })
      .from(stockTransferItems)
      .innerJoin(stockTransfers, eq(stockTransferItems.transfer_id, stockTransfers.id))
      .where(branchCondition);
    stats.total_quantity = Number(totalQuantity);

    const conditions = [branchCondition];
    if (filters.status) conditions.push(eq(stockTransfers.status, filters.status));
    const search = String(filters.search ?? "").trim();
    if (search) {
      const like = `%${search}%`;
      conditions.push(
        sql`(
          lower(coalesce(${stockTransfers.notes}, '')) like lower(${like})
          or exists (
            select 1 from stock_locations sl
            where sl.id in (${stockTransfers.from_location_id}, ${stockTransfers.to_location_id})
              and lower(sl.name) like lower(${like})
          )
        )`,
      );
    }
    const where = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(stockTransfers)
      .where(where);

    // Get paginated transfers
    const offset = (page - 1) * limit;
    const transfers = await db
      .select(this.transferSelection())
      .from(stockTransfers)
      .where(where)
      .orderBy(sql`${stockTransfers.created_at} desc`)
      .limit(limit)
      .offset(offset);

    const transfersWithItems = await this.attachTransferItems(transfers);

    return {
      transfers: transfersWithItems,
      count: Number(count),
      page,
      limit,
      totalPages: Math.ceil(Number(count) / limit),
      stats,
    };
  }

  async findTransferById(id: string) {
    const branchId = requireBranchId();
    const allowedLocations = await this.rolePermissions.getAllowedLocations("transfers");
    const [transfer] = await db
      .select(this.transferSelection())
      .from(stockTransfers)
      .where(and(eq(stockTransfers.id, id), eq(stockTransfers.branch_id, branchId)))
      .limit(1);

    if (!transfer) throw new NotFoundException("Transfer not found");
    if (
      allowedLocations !== null &&
      !allowedLocations.includes((transfer as any).from_location_id) &&
      !allowedLocations.includes((transfer as any).to_location_id)
    ) {
      throw new ForbiddenException(
        "Your role does not have access to either location on this transfer.",
      );
    }

    const [withItems] = await this.attachTransferItems([transfer]);

    // Current live balance at both locations, for "amount left today" context
    // alongside the balance recorded at transfer time.
    const locationIds = Array.from(
      new Set(
        withItems.items.flatMap((i: any) =>
          [i.source_location_id, i.destination_location_id].filter(Boolean),
        ),
      ),
    );
    const itemIds = Array.from(
      new Set(
        withItems.items.flatMap((i: any) =>
          [i.inventory_item_id, i.received_as_item_id].filter(Boolean),
        ),
      ),
    );
    const currentStock =
      locationIds.length && itemIds.length
        ? await db
            .select({
              inventory_item_id: inventoryStock.inventory_item_id,
              location_id: inventoryStock.location_id,
              quantity: inventoryStock.quantity,
            })
            .from(inventoryStock)
            .where(
              and(
                eq(inventoryStock.branch_id, branchId),
                inArray(inventoryStock.inventory_item_id, itemIds as string[]),
                inArray(inventoryStock.location_id, locationIds as string[]),
              ),
            )
        : [];
    const currentQty = (itemId: string | null, locationId: string | null) =>
      currentStock.find(
        (s) => s.inventory_item_id === itemId && s.location_id === locationId,
      )?.quantity ?? null;

    return {
      ...withItems,
      items: withItems.items.map((i: any) => ({
        ...i,
        source_current_quantity: currentQty(i.inventory_item_id, i.source_location_id),
        destination_current_quantity: currentQty(
          i.received_as_item_id ?? i.inventory_item_id,
          i.destination_location_id,
        ),
      })),
    };
  }

  async create(payload: any) {
    const allowedLocations = await this.rolePermissions.getAllowedLocations("inventory");
    return db.transaction(async (tx) => {
      const [created] = await tx
        .insert(inventoryItems)
        .values({
          ...tenantInsert(),
          ...(payload.id ? { id: payload.id } : {}),
          name: payload.name,
          unit: payload.unit ?? "piece",
          base_unit: payload.base_unit ?? "piece",
          pieces_per_unit: Math.max(
            1,
            numberOrZero(payload.pieces_per_unit ?? 1),
          ),
          min_quantity: numberOrZero(payload.min_quantity),
          min_quantity_mode: payload.min_quantity_mode ?? "global",
          notes: payload.notes ?? null,
          meta: {},
        })
        .returning();

      // Handle stock_by_location if passed in payload, otherwise use generic quantity at default location
      if (Array.isArray(payload.stock_by_location)) {
        for (const stock of payload.stock_by_location) {
          const locId = String(stock.location_id);
          const qty = numberOrZero(stock.quantity);
          const minQty =
            payload.min_quantity_mode === "per_location"
              ? numberOrZero(stock.min_quantity)
              : 0;
          if (locId && (qty >= 0 || minQty >= 0)) {
            this.assertLocationAllowed(allowedLocations, locId);
            await tx.insert(inventoryStock).values({
              ...tenantInsert(),
              inventory_item_id: created.id,
              location_id: locId,
              quantity: qty,
              min_quantity: minQty,
            });
            if (qty > 0) {
              await tx.insert(stockMovements).values({
                ...tenantInsert(),
                inventory_item_id: created.id,
                movement_type: "initial",
                location_id: locId,
                quantity_delta: qty,
                quantity_after: qty,
                created_by: payload.user_id || null,
              });
            }
          }
        }
      } else {
        const qty = numberOrZero(payload.quantity ?? payload.store_quantity);
        if (qty > 0) {
          const [defaultLoc] = await tx
            .select()
            .from(stockLocations)
            .where(and(eq(stockLocations.is_default, true), eq(stockLocations.branch_id, requireBranchId())))
            .limit(1);
          if (defaultLoc) {
            if (allowedLocations !== null && !allowedLocations.includes(defaultLoc.id)) {
              throw new ForbiddenException(
                "Your role does not have access to the branch's default stock location. Specify a location you're allowed to stock.",
              );
            }
            await tx.insert(inventoryStock).values({
              ...tenantInsert(),
              inventory_item_id: created.id,
              location_id: defaultLoc.id,
              quantity: qty,
              min_quantity: 0,
            });
            await tx.insert(stockMovements).values({
              ...tenantInsert(),
              inventory_item_id: created.id,
              movement_type: "initial",
              location_id: defaultLoc.id,
              quantity_delta: qty,
              quantity_after: qty,
              created_by: payload.user_id || null,
            });
          }
        }
      }

      const [fullItem] = await tx
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.id, created.id))
        .limit(1);

      const stocks = await tx
        .select({
          location_id: inventoryStock.location_id,
          location_name: stockLocations.name,
          quantity: inventoryStock.quantity,
          min_quantity: inventoryStock.min_quantity,
        })
        .from(inventoryStock)
        .innerJoin(
          stockLocations,
          eq(inventoryStock.location_id, stockLocations.id),
        )
        .where(eq(inventoryStock.inventory_item_id, created.id));

      const result = {
        ...fullItem,
        stock_by_location: stocks,
      };
      await emitCreated(
        tx,
        "inventory_item",
        "INVENTORY_ITEM_CREATED",
        result as any,
      );
      return result;
    });
  }

  async syncBulk(items: any[]) {
    if (!items || items.length === 0) return {};

    const branchId = requireBranchId();
    const allowedLocations = await this.rolePermissions.getAllowedLocations("inventory");
    const updatedIds: string[] = [];
    const createdIds: string[] = [];

    await db.transaction(async (tx) => {
      for (const payload of items) {
        const [existing] = payload.id
          ? await tx
              .select({ id: inventoryItems.id })
              .from(inventoryItems)
              .where(
                and(
                  eq(inventoryItems.id, payload.id),
                  eq(inventoryItems.branch_id, branchId),
                ),
              )
              .limit(1)
          : [];

        if (existing) {
          const updates: Record<string, any> = { updated_at: new Date() };
          [
            "name",
            "unit",
            "base_unit",
            "pieces_per_unit",
            "min_quantity",
            "min_quantity_mode",
            "notes",
          ].forEach((key) => {
            if (payload[key] !== undefined) {
              updates[key] =
                key === "pieces_per_unit" || key === "min_quantity"
                  ? numberOrZero(payload[key])
                  : payload[key];
            }
          });
          if (updates.pieces_per_unit !== undefined) {
            updates.pieces_per_unit = Math.max(1, updates.pieces_per_unit);
          }

          await tx
            .update(inventoryItems)
            .set(updates)
            .where(
              and(
                eq(inventoryItems.id, payload.id),
                eq(inventoryItems.branch_id, branchId),
              ),
            );
          await this.reconcileStock(tx, payload.id, payload, allowedLocations);
          updatedIds.push(payload.id);
        } else {
          const [created] = await tx
            .insert(inventoryItems)
            .values({
              ...tenantInsert(),
              ...(payload.id ? { id: payload.id } : {}),
              name: payload.name,
              unit: payload.unit ?? "piece",
              base_unit: payload.base_unit ?? "piece",
              pieces_per_unit: Math.max(
                1,
                numberOrZero(payload.pieces_per_unit ?? 1),
              ),
              min_quantity: numberOrZero(payload.min_quantity),
              min_quantity_mode: payload.min_quantity_mode ?? "global",
              notes: payload.notes ?? null,
              meta: {},
            })
            .returning();
          await this.applyInitialStock(tx, created.id, payload, allowedLocations);
          createdIds.push(created.id);
        }
      }
    });

    for (const id of updatedIds) {
      const item = await this.findOne(id);
      await emitUpdated(db, "inventory_item", "INVENTORY_ITEM_UPDATED", item as any);
    }
    for (const id of createdIds) {
      const item = await this.findOne(id);
      await emitCreated(db, "inventory_item", "INVENTORY_ITEM_CREATED", item as any);
    }

    return {};
  }

  // Seed stock for a newly-created item from `stock_by_location` (or a single
  // generic `quantity` placed at the default location). Mirrors `create`.
  private async applyInitialStock(
    tx: any,
    itemId: string,
    payload: any,
    allowedLocations: string[] | null,
  ) {
    if (Array.isArray(payload.stock_by_location)) {
      for (const stock of payload.stock_by_location) {
        const locId = String(stock.location_id);
        const qty = numberOrZero(stock.quantity);
        const minQty =
          payload.min_quantity_mode === "per_location"
            ? numberOrZero(stock.min_quantity)
            : 0;
        if (locId && (qty >= 0 || minQty >= 0)) {
          this.assertLocationAllowed(allowedLocations, locId);
          await tx.insert(inventoryStock).values({
            ...tenantInsert(),
            inventory_item_id: itemId,
            location_id: locId,
            quantity: qty,
            min_quantity: minQty,
          });
          if (qty > 0) {
            await tx.insert(stockMovements).values({
              ...tenantInsert(),
              inventory_item_id: itemId,
              movement_type: "initial",
              location_id: locId,
              quantity_delta: qty,
              quantity_after: qty,
              created_by: payload.user_id || null,
            });
          }
        }
      }
    } else {
      const qty = numberOrZero(payload.quantity ?? payload.store_quantity);
      if (qty > 0) {
        const [defaultLoc] = await tx
          .select()
          .from(stockLocations)
          .where(
            and(
              eq(stockLocations.is_default, true),
              eq(stockLocations.branch_id, requireBranchId()),
            ),
          )
          .limit(1);
        if (defaultLoc) {
          this.assertLocationAllowed(allowedLocations, defaultLoc.id);
          await tx.insert(inventoryStock).values({
            ...tenantInsert(),
            inventory_item_id: itemId,
            location_id: defaultLoc.id,
            quantity: qty,
            min_quantity: 0,
          });
          await tx.insert(stockMovements).values({
            ...tenantInsert(),
            inventory_item_id: itemId,
            movement_type: "initial",
            location_id: defaultLoc.id,
            quantity_delta: qty,
            quantity_after: qty,
            created_by: payload.user_id || null,
          });
        }
      }
    }
  }

  // Reconcile stock for an existing item against `stock_by_location`, logging
  // an adjustment/initial movement for any delta. Mirrors `update`.
  private async reconcileStock(
    tx: any,
    itemId: string,
    payload: any,
    allowedLocations: string[] | null,
  ) {
    if (!Array.isArray(payload.stock_by_location)) return;
    for (const stock of payload.stock_by_location) {
      const locId = String(stock.location_id);
      const qty = numberOrZero(stock.quantity);
      const minQty = numberOrZero(stock.min_quantity);
      if (!locId) continue;
      this.assertLocationAllowed(allowedLocations, locId);

      const [existingStock] = await tx
        .select()
        .from(inventoryStock)
        .where(
          and(
            eq(inventoryStock.inventory_item_id, itemId),
            eq(inventoryStock.location_id, locId),
          ),
        )
        .limit(1);

      const finalMinQty =
        payload.min_quantity_mode === "per_location" ? minQty : 0;

      if (existingStock) {
        const delta = qty - existingStock.quantity;
        if (delta !== 0) {
          await tx
            .update(inventoryStock)
            .set({ quantity: qty, min_quantity: finalMinQty })
            .where(eq(inventoryStock.id, existingStock.id));
          await tx.insert(stockMovements).values({
            ...tenantInsert(),
            inventory_item_id: itemId,
            movement_type: "adjustment",
            location_id: locId,
            quantity_delta: delta,
            quantity_after: qty,
            created_by: payload.user_id || null,
          });
        } else if (finalMinQty !== existingStock.min_quantity) {
          await tx
            .update(inventoryStock)
            .set({ min_quantity: finalMinQty })
            .where(eq(inventoryStock.id, existingStock.id));
        }
      } else {
        await tx.insert(inventoryStock).values({
          ...tenantInsert(),
          inventory_item_id: itemId,
          location_id: locId,
          quantity: qty,
          min_quantity: finalMinQty,
        });
        if (qty > 0) {
          await tx.insert(stockMovements).values({
            ...tenantInsert(),
            inventory_item_id: itemId,
            movement_type: "initial",
            location_id: locId,
            quantity_delta: qty,
            quantity_after: qty,
            created_by: payload.user_id || null,
          });
        }
      }
    }
  }

  async update(id: string, payload: any) {
    const allowedLocations = await this.rolePermissions.getAllowedLocations("inventory");
    const updates: Record<string, any> = {
      updated_at: new Date(),
    };
    [
      "name",
      "unit",
      "base_unit",
      "pieces_per_unit",
      "min_quantity",
      "min_quantity_mode",
      "notes",
    ].forEach((key) => {
      if (payload[key] !== undefined) {
        updates[key] =
          key === "pieces_per_unit" || key === "min_quantity"
            ? numberOrZero(payload[key])
            : payload[key];
      }
    });

    if (updates.pieces_per_unit !== undefined) {
      updates.pieces_per_unit = Math.max(1, updates.pieces_per_unit);
    }

    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(inventoryItems)
        .set(updates)
        .where(and(eq(inventoryItems.id, id), eq(inventoryItems.branch_id, requireBranchId())))
        .returning();

      if (!updated) throw new NotFoundException("Inventory item not found");

      if (Array.isArray(payload.stock_by_location)) {
        for (const stock of payload.stock_by_location) {
          const locId = String(stock.location_id);
          const qty = numberOrZero(stock.quantity);
          const minQty = numberOrZero(stock.min_quantity);
          if (locId) {
            this.assertLocationAllowed(allowedLocations, locId);
            const [existingStock] = await tx
              .select()
              .from(inventoryStock)
              .where(
                and(
                  eq(inventoryStock.inventory_item_id, id),
                  eq(inventoryStock.location_id, locId),
                ),
              )
              .limit(1);

            if (existingStock) {
              const delta = qty - existingStock.quantity;
              const finalMinQty =
                payload.min_quantity_mode === "per_location" ? minQty : 0;

              if (delta !== 0) {
                await tx
                  .update(inventoryStock)
                  .set({ quantity: qty, min_quantity: finalMinQty })
                  .where(eq(inventoryStock.id, existingStock.id));

                await tx.insert(stockMovements).values({
                  ...tenantInsert(),
                  inventory_item_id: id,
                  movement_type: "adjustment",
                  location_id: locId,
                  quantity_delta: delta,
                  quantity_after: qty,
                  created_by: payload.user_id || null,
                });
              } else if (finalMinQty !== existingStock.min_quantity) {
                await tx
                  .update(inventoryStock)
                  .set({ min_quantity: finalMinQty })
                  .where(eq(inventoryStock.id, existingStock.id));
              }
            } else {
              const finalMinQty =
                payload.min_quantity_mode === "per_location" ? minQty : 0;
              await tx.insert(inventoryStock).values({
                ...tenantInsert(),
                inventory_item_id: id,
                location_id: locId,
                quantity: qty,
                min_quantity: finalMinQty,
              });
              if (qty > 0) {
                await tx.insert(stockMovements).values({
                  ...tenantInsert(),
                  inventory_item_id: id,
                  movement_type: "initial",
                  location_id: locId,
                  quantity_delta: qty,
                  quantity_after: qty,
                  created_by: payload.user_id || null,
                });
              }
            }
          }
        }
      }

      const stocks =
        allowedLocations !== null && allowedLocations.length === 0
          ? []
          : await tx
              .select({
                location_id: inventoryStock.location_id,
                location_name: stockLocations.name,
                quantity: inventoryStock.quantity,
                min_quantity: inventoryStock.min_quantity,
              })
              .from(inventoryStock)
              .innerJoin(
                stockLocations,
                eq(inventoryStock.location_id, stockLocations.id),
              )
              .where(
                allowedLocations !== null
                  ? and(
                      eq(inventoryStock.inventory_item_id, id),
                      inArray(inventoryStock.location_id, allowedLocations),
                    )
                  : eq(inventoryStock.inventory_item_id, id),
              );

      const result = {
        ...updated,
        stock_by_location: stocks,
      };
      await emitUpdated(
        tx,
        "inventory_item",
        "INVENTORY_ITEM_UPDATED",
        result as any,
      );
      return result;
    });
  }

  async delete(id: string) {
    // recipe_ingredients references inventory_items with onDelete: "restrict",
    // so deleting an item still used in a recipe would fail with a raw FK error.
    // Detect this up front and surface a clear, actionable message instead.
    const usedIn = await db
      .select({ recipeName: recipes.name, menuName: menuItems.name })
      .from(recipeIngredients)
      .innerJoin(recipes, eq(recipeIngredients.recipe_id, recipes.id))
      .leftJoin(menuItems, eq(recipes.menu_item_id, menuItems.id))
      .where(eq(recipeIngredients.inventory_item_id, id));

    if (usedIn.length > 0) {
      const names = Array.from(
        new Set(usedIn.map((r) => r.menuName || r.recipeName).filter(Boolean)),
      );
      throw new BadRequestException(
        `Cannot delete this inventory item because it is used in ${usedIn.length} recipe(s)` +
          (names.length ? `: ${names.join(", ")}` : "") +
          ". Remove it from those recipes first.",
      );
    }

    await emitDeleted(db, "inventory_item", "INVENTORY_ITEM_DELETED", id);
    const [deleted] = await db
      .delete(inventoryItems)
      .where(and(eq(inventoryItems.id, id), eq(inventoryItems.branch_id, requireBranchId())))
      .returning({ id: inventoryItems.id });
    if (!deleted) throw new NotFoundException("Inventory item not found");
    return deleted;
  }

  async getStockMovements(inventoryItemId: string, locationId?: string, page: number = 1, limit: number = 20) {
    const allowedLocations = await this.rolePermissions.getAllowedLocations("inventory");
    const whereConditions = [
      eq(stockMovements.branch_id, requireBranchId()),
      eq(stockMovements.inventory_item_id, inventoryItemId),
    ];

    if (locationId) {
      this.assertLocationAllowed(allowedLocations, locationId);
      whereConditions.push(eq(stockMovements.location_id, locationId));
    } else if (allowedLocations !== null) {
      if (allowedLocations.length === 0) {
        return { movements: [], count: 0, page, limit, totalPages: 0 };
      }
      whereConditions.push(inArray(stockMovements.location_id, allowedLocations));
    }

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(stockMovements)
      .where(and(...whereConditions));

    // Get paginated movements
    const offset = (page - 1) * limit;
    const movements = await db
      .select({
        id: stockMovements.id,
        movement_type: stockMovements.movement_type,
        location_id: stockMovements.location_id,
        location_name: sql<string>`(select name from stock_locations where id = ${stockMovements.location_id})`,
        quantity_delta: stockMovements.quantity_delta,
        quantity_after: stockMovements.quantity_after,
        notes: stockMovements.notes,
        meta: stockMovements.meta,
        created_by: stockMovements.created_by,
        created_at: stockMovements.created_at,
        user_name: sql<string>`(select name from users where id = ${stockMovements.created_by})`,
        order_id: stockMovements.order_id,
        order_item_id: stockMovements.order_item_id,
        menu_item_name: sql<string>`(select name from menu_items where id = (${stockMovements.meta}->>'menu_item_id')::uuid)`,
      })
      .from(stockMovements)
      .where(and(...whereConditions))
      .orderBy(sql`${stockMovements.created_at} desc`)
      .limit(limit)
      .offset(offset);

    return {
      movements,
      count: Number(count),
      page,
      limit,
      totalPages: Math.ceil(Number(count) / limit),
    };
  }

  // Branch-wide stock ledger — every deduction and addition (sales, sale
  // reversals, transfers, manual adjustments, initial stock-ins) in one
  // paginated, filterable feed with the running balance left after each entry.
  async getLedger(filters: {
    page?: number;
    limit?: number;
    movementType?: string;
    locationId?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const branchId = requireBranchId();
    const allowedLocations = await this.rolePermissions.getAllowedLocations("inventory");
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 25, 1), 200);
    const offset = (page - 1) * limit;

    if (allowedLocations !== null && allowedLocations.length === 0) {
      return {
        movements: [],
        count: 0,
        page,
        limit,
        totalPages: 0,
        stats: { total_movements: 0, total_in: 0, total_out: 0, net_change: 0 },
      };
    }

    const conditions = [eq(stockMovements.branch_id, branchId)] as any[];
    if (filters.movementType) {
      conditions.push(eq(stockMovements.movement_type, filters.movementType));
    }
    if (filters.locationId) {
      this.assertLocationAllowed(allowedLocations, filters.locationId);
      conditions.push(eq(stockMovements.location_id, filters.locationId));
    } else if (allowedLocations !== null) {
      conditions.push(inArray(stockMovements.location_id, allowedLocations));
    }
    // Every deduction is logged forever, so without a window this feed only
    // grows — default to a rolling 30 days (same convention as payments/orders
    // history) unless the caller asks for an explicit range.
    const to = filters.dateTo ? new Date(filters.dateTo) : new Date();
    const from = filters.dateFrom
      ? new Date(filters.dateFrom)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    conditions.push(gte(stockMovements.created_at, from));
    conditions.push(lte(stockMovements.created_at, to));
    const search = String(filters.search ?? "").trim();
    if (search) {
      conditions.push(ilike(inventoryItems.name, `%${search}%`));
    }
    const where = and(...conditions);

    const [{ count, totalIn, totalOut }] = await db
      .select({
        count: sql<number>`count(*)`,
        totalIn: sql<number>`coalesce(sum(case when ${stockMovements.quantity_delta} > 0 then ${stockMovements.quantity_delta} else 0 end), 0)`,
        totalOut: sql<number>`coalesce(sum(case when ${stockMovements.quantity_delta} < 0 then -${stockMovements.quantity_delta} else 0 end), 0)`,
      })
      .from(stockMovements)
      .innerJoin(inventoryItems, eq(stockMovements.inventory_item_id, inventoryItems.id))
      .where(where);

    const rows = await db
      .select({
        id: stockMovements.id,
        inventory_item_id: stockMovements.inventory_item_id,
        item_name: inventoryItems.name,
        base_unit: inventoryItems.base_unit,
        movement_type: stockMovements.movement_type,
        location_id: stockMovements.location_id,
        location_name: stockLocations.name,
        quantity_delta: stockMovements.quantity_delta,
        quantity_after: stockMovements.quantity_after,
        quantity_before: sql<number>`${stockMovements.quantity_after} - ${stockMovements.quantity_delta}`,
        transfer_id: stockMovements.transfer_id,
        transfer_from_location_name: sql<string>`(
          select sl.name from stock_transfers st
          join stock_locations sl on sl.id = st.from_location_id
          where st.id = ${stockMovements.transfer_id}
        )`,
        transfer_to_location_name: sql<string>`(
          select sl.name from stock_transfers st
          join stock_locations sl on sl.id = st.to_location_id
          where st.id = ${stockMovements.transfer_id}
        )`,
        order_id: stockMovements.order_id,
        order_number: sql<number>`(select order_number from orders where id = ${stockMovements.order_id})`,
        notes: stockMovements.notes,
        meta: stockMovements.meta,
        created_by: stockMovements.created_by,
        user_name: users.name,
        created_at: stockMovements.created_at,
      })
      .from(stockMovements)
      .innerJoin(inventoryItems, eq(stockMovements.inventory_item_id, inventoryItems.id))
      .leftJoin(stockLocations, eq(stockMovements.location_id, stockLocations.id))
      .leftJoin(users, eq(stockMovements.created_by, users.id))
      .where(where)
      .orderBy(sql`${stockMovements.created_at} desc`)
      .limit(limit)
      .offset(offset);

    return {
      movements: rows,
      count: Number(count),
      page,
      limit,
      totalPages: Math.ceil(Number(count) / limit),
      stats: {
        total_movements: Number(count),
        total_in: Number(totalIn),
        total_out: Number(totalOut),
        net_change: Number(totalIn) - Number(totalOut),
      },
    };
  }

  async adjustStock(params: {
    inventoryItemId: string;
    locationId: string;
    delta: number; // negative = deduct, positive = add
    movementType: string;
    meta?: {
      orderId?: string;
      updateType?: string;
      source?: string;
      newQuantity?: number;
      previousQuantity?: number;
      delta?: number;
      orderItemId?: string;
      recipeId?: string;
      transferId?: string;
      notes?: string;
    };
    createdBy?: string;
  }): Promise<{ quantityBefore: number; quantityAfter: number }> {
    const {
      inventoryItemId,
      locationId,
      delta,
      movementType,
      meta,
      createdBy,
    } = params;
    const branchId = requireBranchId();

    // Check idempotency for order/sync
    if (meta?.orderId && meta?.orderItemId) {
      const existingMovements = await db
        .select()
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.branch_id, branchId),
            eq(stockMovements.inventory_item_id, inventoryItemId),
            eq(stockMovements.location_id, locationId),
            eq(stockMovements.movement_type, movementType),
          ),
        );

      if (meta?.orderItemId) {
        const dup = existingMovements.find(
          (m) => m.order_item_id === meta.orderItemId,
        );
        if (dup) {
          const [stock] = await db
            .select()
            .from(inventoryStock)
            .where(
              and(
                eq(inventoryStock.branch_id, branchId),
                eq(inventoryStock.inventory_item_id, inventoryItemId),
                eq(inventoryStock.location_id, locationId),
              ),
            )
            .limit(1);
          const qty = stock ? stock.quantity : 0;
          return { quantityBefore: qty, quantityAfter: qty };
        }
      }
    }

    return db.transaction(async (tx) => {
      let [stock] = await tx
        .select()
        .from(inventoryStock)
        .where(
          and(
            eq(inventoryStock.branch_id, branchId),
            eq(inventoryStock.inventory_item_id, inventoryItemId),
            eq(inventoryStock.location_id, locationId),
          ),
        )
        .limit(1);

      const quantityBefore = stock ? stock.quantity : 0;
      const quantityAfter = quantityBefore + delta;

      if (quantityAfter < 0) {
        throw new BadRequestException(
          `Insufficient stock at location (available: ${quantityBefore}, requested: ${Math.abs(delta)})`,
        );
      }

      if (stock) {
        await tx
          .update(inventoryStock)
          .set({ quantity: quantityAfter })
          .where(eq(inventoryStock.id, stock.id));
      } else {
        await tx.insert(inventoryStock).values({
          ...tenantInsert(),
          inventory_item_id: inventoryItemId,
          location_id: locationId,
          quantity: quantityAfter,
          min_quantity: 0,
        });
      }

      await tx.insert(stockMovements).values({
        ...tenantInsert(),
        inventory_item_id: inventoryItemId,
        movement_type: movementType,
        location_id: locationId,
        quantity_delta: delta,
        quantity_after: quantityAfter,
        transfer_id: meta?.transferId || null,
        order_id: meta?.orderId || null,
        order_item_id: meta?.orderItemId || null,
        notes: meta?.notes || null,
        created_by: createdBy || null,
        meta: meta || {},
      });

      return { quantityBefore, quantityAfter };
    });
  }

  async updateQuantity(id: string, payload: any) {
    const branchId = requireBranchId();
    let locationId = payload.location_id || payload.locationId || "";
    if (!locationId) {
      const [defaultLoc] = await db
        .select()
        .from(stockLocations)
        .where(and(eq(stockLocations.is_default, true), eq(stockLocations.branch_id, branchId)))
        .limit(1);
      if (!defaultLoc)
        throw new BadRequestException("Set a main stock place first.");
      locationId = defaultLoc.id;
    }
    const allowedLocations = await this.rolePermissions.getAllowedLocations("inventory");
    this.assertLocationAllowed(allowedLocations, locationId);

    const delta =
      payload.delta !== undefined ? numberOrZero(payload.delta) : null;
    const quantity =
      payload.quantity !== undefined ? numberOrZero(payload.quantity) : null;

    if (delta === null && quantity === null) {
      throw new BadRequestException(
        "Either delta or quantity must be provided",
      );
    }

    const movementType = delta !== null ? "adjustment" : "count";

    if (quantity !== null && delta === null) {
      const [stock] = await db
        .select()
        .from(inventoryStock)
        .where(
          and(
            eq(inventoryStock.branch_id, branchId),
            eq(inventoryStock.inventory_item_id, id),
            eq(inventoryStock.location_id, locationId),
          ),
        )
        .limit(1);
      const currentQty = stock ? stock.quantity : 0;
      const calculatedDelta = quantity - currentQty;

      // Enhanced logging for manual quantity set
      await this.adjustStock({
        inventoryItemId: id,
        locationId,
        delta: calculatedDelta,
        movementType,
        meta: {
          notes: payload.notes || `Manual quantity update: set to ${quantity}`,
          updateType: "manual_set",
          previousQuantity: currentQty,
          newQuantity: quantity,
          source: "inventory_management",
        },
        createdBy: payload.user_id,
      });
    } else if (delta !== null) {
      // Enhanced logging for manual delta adjustment
      const action = delta > 0 ? "added" : "removed";
      await this.adjustStock({
        inventoryItemId: id,
        locationId,
        delta,
        movementType,
        meta: {
          notes:
            payload.notes ||
            `Manual stock ${action}: ${delta > 0 ? "+" : ""}${delta}`,
          updateType: "manual_adjustment",
          delta: delta,
          source: "inventory_management",
        },
        createdBy: payload.user_id,
      });
    }

    const [updated] = await db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, id), eq(inventoryItems.branch_id, branchId)))
      .limit(1);

    const stocks = await db
      .select({
        location_id: inventoryStock.location_id,
        location_name: stockLocations.name,
        quantity: inventoryStock.quantity,
        min_quantity: inventoryStock.min_quantity,
      })
      .from(inventoryStock)
      .innerJoin(
        stockLocations,
        eq(inventoryStock.location_id, stockLocations.id),
      )
      .where(
        and(
          eq(inventoryStock.inventory_item_id, id),
          eq(inventoryStock.branch_id, branchId),
        ),
      );

    return {
      ...updated,
      stock_by_location: stocks,
    };
  }

  async createTransfer(payload: any) {
    const fromLocationId = String(payload.from_location_id || "");
    const toLocationId = String(payload.to_location_id || "");
    const lines = Array.isArray(payload.items) ? payload.items : [];

    if (!fromLocationId || !toLocationId) {
      throw new BadRequestException(
        "Source and destination locations are required",
      );
    }
    if (fromLocationId === toLocationId) {
      throw new BadRequestException(
        "Source and destination locations must be different",
      );
    }
    if (lines.length === 0) {
      throw new BadRequestException("Transfer requires at least one item");
    }

    const allowedLocations = await this.rolePermissions.getAllowedLocations("transfers");
    this.assertLocationAllowed(allowedLocations, fromLocationId);
    this.assertLocationAllowed(allowedLocations, toLocationId);

    const branchId = requireBranchId();
    return db.transaction(async (tx) => {
      const [transfer] = await tx
        .insert(stockTransfers)
        .values({
          ...tenantInsert(),
          ...(payload.id ? { id: payload.id } : {}),
          from_location_id: fromLocationId,
          to_location_id: toLocationId,
          status: payload.status ?? "sent",
          notes: payload.notes ?? null,
          created_by: payload.user_id,
          meta: {},
        })
        .returning();

      const createdItems: any[] = [];
      for (const line of lines) {
        const itemId = String(line.inventory_item_id || "");
        const quantity = numberOrZero(line.quantity);
        if (!itemId || quantity <= 0) {
          throw new BadRequestException("Check the items and amounts and try again.");
        }

        const [item] = await tx
          .select()
          .from(inventoryItems)
          .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.branch_id, branchId)))
          .limit(1);
        if (!item)
          throw new NotFoundException("We couldn't find that stock item.");

        // One-to-many link: a linked source item is received as its target
        // item at the destination (quantity × conversion_factor). Unlinked
        // items keep the one-to-one behavior and are received as themselves.
        const [link] = await tx
          .select()
          .from(inventoryItemLinks)
          .where(
            and(
              eq(inventoryItemLinks.branch_id, branchId),
              eq(inventoryItemLinks.source_item_id, itemId),
            ),
          )
          .limit(1);

        let receivedItemId = itemId;
        let receivedQty = quantity;
        let receivedItemName = item.name;
        if (link) {
          const [target] = await tx
            .select()
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.id, link.target_item_id),
                eq(inventoryItems.branch_id, branchId),
              ),
            )
            .limit(1);
          if (!target)
            throw new NotFoundException(
              `Linked target item for "${item.name}" not found`,
            );
          receivedItemId = target.id;
          receivedItemName = target.name;
          receivedQty = quantity * Math.max(1, link.conversion_factor ?? 1);
        }

        const [fromStock] = await tx
          .select()
          .from(inventoryStock)
          .where(
            and(
              eq(inventoryStock.branch_id, branchId),
              eq(inventoryStock.inventory_item_id, itemId),
              eq(inventoryStock.location_id, fromLocationId),
            ),
          )
          .limit(1);
        const fromQty = fromStock ? fromStock.quantity : 0;
        if (fromQty < quantity) {
          throw new BadRequestException(
            `Insufficient stock for "${item.name}" at source location`,
          );
        }

        const newFromQty = fromQty - quantity;
        if (fromStock) {
          await tx
            .update(inventoryStock)
            .set({ quantity: newFromQty })
            .where(eq(inventoryStock.id, fromStock.id));
        } else {
          await tx.insert(inventoryStock).values({
            ...tenantInsert(),
            inventory_item_id: itemId,
            location_id: fromLocationId,
            quantity: -quantity,
            min_quantity: 0,
          });
        }

        const [toStock] = await tx
          .select()
          .from(inventoryStock)
          .where(
            and(
              eq(inventoryStock.branch_id, branchId),
              eq(inventoryStock.inventory_item_id, receivedItemId),
              eq(inventoryStock.location_id, toLocationId),
            ),
          )
          .limit(1);
        const toQty = toStock ? toStock.quantity : 0;
        const newToQty = toQty + receivedQty;
        if (toStock) {
          await tx
            .update(inventoryStock)
            .set({ quantity: newToQty })
            .where(eq(inventoryStock.id, toStock.id));
        } else {
          await tx.insert(inventoryStock).values({
            ...tenantInsert(),
            inventory_item_id: receivedItemId,
            location_id: toLocationId,
            quantity: receivedQty,
            min_quantity: 0,
          });
        }

        const [createdLine] = await tx
          .insert(stockTransferItems)
          .values({
            ...tenantInsert(),
            transfer_id: transfer.id,
            inventory_item_id: itemId,
            quantity,
            meta: link
              ? {
                  received_as: receivedItemId,
                  received_as_name: receivedItemName,
                  received_quantity: receivedQty,
                  conversion_factor: Math.max(1, link.conversion_factor ?? 1),
                }
              : {},
          })
          .returning();
        createdItems.push(createdLine);

        await tx.insert(stockMovements).values([
          {
            ...tenantInsert(),
            inventory_item_id: itemId,
            movement_type: "transfer_out",
            location_id: fromLocationId,
            quantity_delta: -quantity,
            quantity_after: newFromQty,
            transfer_id: transfer.id,
            created_by: payload.user_id,
          },
          {
            ...tenantInsert(),
            inventory_item_id: receivedItemId,
            movement_type: "transfer_in",
            location_id: toLocationId,
            quantity_delta: receivedQty,
            quantity_after: newToQty,
            transfer_id: transfer.id,
            created_by: payload.user_id,
            meta: link ? { converted_from: itemId } : {},
          },
        ]);
      }

      return { ...transfer, items: createdItems };
    });
  }

  async receiveTransfer(id: string, payload: any) {
    const branchId = requireBranchId();
    const allowedLocations = await this.rolePermissions.getAllowedLocations("transfers");
    if (allowedLocations !== null) {
      const [transfer] = await db
        .select({ to_location_id: stockTransfers.to_location_id })
        .from(stockTransfers)
        .where(and(eq(stockTransfers.id, id), eq(stockTransfers.branch_id, branchId)))
        .limit(1);
      if (!transfer) throw new NotFoundException("Transfer not found");
      this.assertLocationAllowed(allowedLocations, transfer.to_location_id);
    }

    const [updated] = await db
      .update(stockTransfers)
      .set({
        status: "received",
        received_by: payload.user_id,
        received_at: new Date(),
        updated_at: new Date(),
      })
      .where(and(eq(stockTransfers.id, id), eq(stockTransfers.branch_id, branchId)))
      .returning();
    if (!updated) throw new NotFoundException("Transfer not found");
    return updated;
  }

  async checkAvailability(
    items: Array<{ menu_item_id: string; quantity: number }>,
  ) {
    const branchId = requireBranchId();
    const locationsList = await db
      .select()
      .from(stockLocations)
      .where(eq(stockLocations.branch_id, branchId));
    const defaultLoc =
      locationsList.find((l) => l.is_default) || locationsList[0];

    const resolveLocationId = (recipe: any, menuItem: any) => {
      if (
        recipe.deduct_strategy === "fixed_location" &&
        recipe.deduct_from_location_id
      ) {
        return recipe.deduct_from_location_id;
      }
      if (
        recipe.deduct_strategy === "by_menu_category" &&
        menuItem.main_category
      ) {
        const matched = locationsList.find(
          (l) => l.linked_main_category_slug === menuItem.main_category,
        );
        if (matched) return matched.id;
      }
      return defaultLoc?.id;
    };

    const requirementsMap = new Map<
      string,
      { inventory_item_id: string; location_id: string; quantity: number }
    >();

    for (const item of items) {
      const menuItemId = String(item.menu_item_id || "");
      const qtyOrdered = Number(item.quantity);
      if (!menuItemId || qtyOrdered <= 0) continue;

      const [menuItem] = await db
        .select()
        .from(menuItems)
        .where(and(eq(menuItems.id, menuItemId), eq(menuItems.branch_id, branchId)))
        .limit(1);
      if (!menuItem) continue;

      const [recipe] = await db
        .select()
        .from(recipes)
        .where(
          and(
            eq(recipes.menu_item_id, menuItemId),
            eq(recipes.is_active, true),
            eq(recipes.branch_id, branchId),
          ),
        )
        .limit(1);
      if (!recipe) continue;

      const ingredients = await db
        .select()
        .from(recipeIngredients)
        .where(
          and(
            eq(recipeIngredients.recipe_id, recipe.id),
            eq(recipeIngredients.branch_id, branchId),
          ),
        );

      const locId = resolveLocationId(recipe, menuItem);
      if (!locId) continue;

      for (const ingredient of ingredients) {
        const wasteFactor = Number(ingredient.waste_factor || "1.000");
        const requiredQty =
          (qtyOrdered * ingredient.quantity * wasteFactor) /
          recipe.yield_quantity;
        const key = `${ingredient.inventory_item_id}_${locId}`;

        const existing = requirementsMap.get(key) || {
          inventory_item_id: ingredient.inventory_item_id,
          location_id: locId,
          quantity: 0,
        };
        existing.quantity += Math.ceil(requiredQty);
        requirementsMap.set(key, existing);
      }
    }

    const shortfalls = [];
    for (const [_, req] of requirementsMap.entries()) {
      const [stock] = await db
        .select({
          quantity: inventoryStock.quantity,
          item_name: inventoryItems.name,
          base_unit: inventoryItems.base_unit,
          location_name: stockLocations.name,
        })
        .from(inventoryStock)
        .innerJoin(
          inventoryItems,
          eq(inventoryStock.inventory_item_id, inventoryItems.id),
        )
        .innerJoin(
          stockLocations,
          eq(inventoryStock.location_id, stockLocations.id),
        )
        .where(
          and(
            eq(inventoryStock.branch_id, branchId),
            eq(inventoryStock.inventory_item_id, req.inventory_item_id),
            eq(inventoryStock.location_id, req.location_id),
          ),
        )
        .limit(1);

      const available = stock ? stock.quantity : 0;
      if (available < req.quantity) {
        let itemName = stock?.item_name;
        let baseUnit = stock?.base_unit || "piece";
        let locationName = stock?.location_name;

        if (!stock) {
          const [item] = await db
            .select()
            .from(inventoryItems)
            .where(and(eq(inventoryItems.id, req.inventory_item_id), eq(inventoryItems.branch_id, branchId)))
            .limit(1);
          const [loc] = await db
            .select()
            .from(stockLocations)
            .where(and(eq(stockLocations.id, req.location_id), eq(stockLocations.branch_id, branchId)))
            .limit(1);
          itemName = item?.name || `Item ${req.inventory_item_id}`;
          baseUnit = item?.base_unit || "piece";
          locationName = loc?.name || `Location ${req.location_id}`;
        }

        shortfalls.push({
          inventory_item_id: req.inventory_item_id,
          name: itemName,
          location_id: req.location_id,
          location_name: locationName,
          required: req.quantity,
          available,
          unit: baseUnit,
        });
      }
    }

    return {
      available: shortfalls.length === 0,
      shortfalls,
    };
  }

  /**
   * Compute inventory-derived availability for every menu item that has an active
   * recipe. For each item we work out how many can still be made from current
   * stock (the limiting ingredient wins) and bucket it into a status the order
   * page can badge. Items without an active recipe are untracked and omitted —
   * the caller treats a missing entry as "available".
   *
   * Returns: [{ menu_item_id, makeable, status: "out" | "low" | "in_stock" }]
   */
  async menuAvailability(lowThreshold = 5) {
    const branchId = requireBranchId();

    const recipeRows = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.is_active, true), eq(recipes.branch_id, branchId)));

    if (recipeRows.length === 0) return [];

    const locationsList = await db
      .select()
      .from(stockLocations)
      .where(eq(stockLocations.branch_id, branchId));
    const defaultLoc =
      locationsList.find((l) => l.is_default) || locationsList[0];

    const resolveLocationId = (recipe: any, menuItem: any) => {
      if (
        recipe.deduct_strategy === "fixed_location" &&
        recipe.deduct_from_location_id
      ) {
        return recipe.deduct_from_location_id;
      }
      if (
        recipe.deduct_strategy === "by_menu_category" &&
        menuItem?.main_category
      ) {
        const matched = locationsList.find(
          (l) => l.linked_main_category_slug === menuItem.main_category,
        );
        if (matched) return matched.id;
      }
      return defaultLoc?.id;
    };

    const menuItemIds = recipeRows.map((r) => r.menu_item_id);
    const menuRows = menuItemIds.length
      ? await db
          .select({ id: menuItems.id, main_category: menuItems.main_category })
          .from(menuItems)
          .where(
            and(
              inArray(menuItems.id, menuItemIds),
              eq(menuItems.branch_id, branchId),
            ),
          )
      : [];
    const menuById = new Map(menuRows.map((m) => [m.id, m]));

    const recipeIds = recipeRows.map((r) => r.id);
    const ingredientRows = recipeIds.length
      ? await db
          .select()
          .from(recipeIngredients)
          .where(
            and(
              inArray(recipeIngredients.recipe_id, recipeIds),
              eq(recipeIngredients.branch_id, branchId),
            ),
          )
      : [];
    const ingredientsByRecipe = new Map<string, any[]>();
    for (const ing of ingredientRows) {
      const list = ingredientsByRecipe.get(ing.recipe_id) || [];
      list.push(ing);
      ingredientsByRecipe.set(ing.recipe_id, list);
    }

    // One pass over branch stock → map keyed by `${itemId}_${locationId}`.
    const stockRows = await db
      .select({
        inventory_item_id: inventoryStock.inventory_item_id,
        location_id: inventoryStock.location_id,
        quantity: inventoryStock.quantity,
      })
      .from(inventoryStock)
      .where(eq(inventoryStock.branch_id, branchId));
    const stockByKey = new Map<string, number>();
    for (const row of stockRows) {
      stockByKey.set(
        `${row.inventory_item_id}_${row.location_id}`,
        numberOrZero(row.quantity),
      );
    }

    const results: Array<{
      menu_item_id: string;
      makeable: number;
      status: "out" | "low" | "in_stock";
    }> = [];

    for (const recipe of recipeRows) {
      const menuItem = menuById.get(recipe.menu_item_id);
      const locId = resolveLocationId(recipe, menuItem);
      const ingredients = ingredientsByRecipe.get(recipe.id) || [];

      // No location resolved or no ingredients → can't track; skip (= available).
      if (!locId || ingredients.length === 0) continue;

      const yieldQty = Math.max(1, Number(recipe.yield_quantity) || 1);
      let makeable = Infinity;
      for (const ingredient of ingredients) {
        const wasteFactor = Number(ingredient.waste_factor || "1.000") || 1;
        const requiredPerUnit =
          (Number(ingredient.quantity) * wasteFactor) / yieldQty;
        if (requiredPerUnit <= 0) continue;
        const available = stockByKey.get(
          `${ingredient.inventory_item_id}_${locId}`,
        );
        makeable = Math.min(
          makeable,
          Math.floor((available ?? 0) / requiredPerUnit),
        );
      }

      if (!Number.isFinite(makeable)) continue;

      const status: "out" | "low" | "in_stock" =
        makeable <= 0 ? "out" : makeable <= lowThreshold ? "low" : "in_stock";

      results.push({ menu_item_id: recipe.menu_item_id, makeable, status });
    }

    return results;
  }

  // Owner-curated subset of inventory items exposed to waiters (e.g. on the
  // sign-in page's Inventory tab), with quantity summed across all locations.
  async getWaiterVisibleItems(): Promise<
    Array<{
      id: string;
      name: string;
      unit: string | null;
      base_unit: string | null;
      min_quantity: number | null;
      quantity: number;
    }>
  > {
    const branchId = requireBranchId();
    const { item_ids } = await this.settingsService.getWaiterVisibleInventoryItemIds();
    if (item_ids.length === 0) return [];

    const items = await db
      .select({
        id: inventoryItems.id,
        name: inventoryItems.name,
        unit: inventoryItems.unit,
        base_unit: inventoryItems.base_unit,
        min_quantity: inventoryItems.min_quantity,
      })
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.branch_id, branchId),
          inArray(inventoryItems.id, item_ids),
        ),
      )
      .orderBy(asc(inventoryItems.name));
    if (items.length === 0) return [];

    const stockRows = await db
      .select({
        inventory_item_id: inventoryStock.inventory_item_id,
        quantity: sql<number>`coalesce(sum(${inventoryStock.quantity}), 0)`,
      })
      .from(inventoryStock)
      .where(
        and(
          eq(inventoryStock.branch_id, branchId),
          inArray(
            inventoryStock.inventory_item_id,
            items.map((i) => i.id),
          ),
        ),
      )
      .groupBy(inventoryStock.inventory_item_id);

    const qtyByItem = new Map(
      stockRows.map((r) => [r.inventory_item_id, numberOrZero(r.quantity)]),
    );

    return items.map((item) => ({
      ...item,
      quantity: qtyByItem.get(item.id) ?? 0,
    }));
  }
}
