import { ConflictException, Injectable } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/drizzle";
import { inventoryItems } from "../../db/tables/inventory-items.table";
import { inventoryStock } from "../../db/tables/inventory-stock.table";
import { menuItems } from "../../db/tables/menu-items.table";
import { recipes } from "../../db/tables/recipes.table";
import { recipeIngredients } from "../../db/tables/recipe-ingredients.table";
import { stockLocations } from "../../db/tables/stock-locations.table";
import { stockMovements } from "../../db/tables/stock-movements.table";
import { requireBranchId, tenantInsert } from "../../common/tenant/tenant-context";

type DbClient = typeof db;

type OrderLine = {
  id?: string;
  menu_item_id?: string;
  quantity?: number;
  main_category?: string;
  item_type?: string;
};

type InventoryRequirement = {
  inventory_item_id: string;
  location_id: string;
  quantity: number;
  order_item_id?: string;
  recipe_id?: string;
  menu_item_id?: string;
  item_name?: string;
  base_unit?: string;
  location_name?: string;
};

const asNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asText = (value: any) =>
  String(value || "")
    .trim()
    .toLowerCase();

@Injectable()
export class OrderInventoryService {
  async reconcileOrderItems(params: {
    tx: DbClient;
    orderId: string;
    previousItems?: OrderLine[];
    nextItems?: OrderLine[];
    createdBy?: string | null;
    allowLowStock?: boolean;
  }) {
    const {
      tx,
      orderId,
      previousItems = [],
      nextItems = [],
      createdBy = null,
      allowLowStock = false,
    } = params;

    if (previousItems.length > 0) {
      const reverseRequirements = await this.buildRequirements(
        tx,
        previousItems,
      );
      await this.applyRequirements(tx, orderId, reverseRequirements, {
        createdBy,
        movementType: "sale_reversal",
        sign: 1,
        allowLowStock,
      });
    }

    if (nextItems.length > 0) {
      const requirements = await this.buildRequirements(tx, nextItems);
      if (!allowLowStock) {
        const shortfalls = await this.findShortfalls(tx, requirements);
        if (shortfalls.length > 0) {
          throw new ConflictException({
            statusCode: 409,
            error: "insufficient_inventory",
            details: shortfalls,
          });
        }
      }

      await this.applyRequirements(tx, orderId, requirements, {
        createdBy,
        movementType: "sale",
        sign: -1,
        allowLowStock,
      });
    }
  }

  async checkAvailability(tx: DbClient, items: OrderLine[]) {
    const requirements = await this.buildRequirements(tx, items);
    const shortfalls = await this.findShortfalls(tx, requirements);

    return {
      available: shortfalls.length === 0,
      shortfalls,
    };
  }

  /**
   * Batched replacement for what used to be up to 5 sequential SELECTs per
   * order line item (menu item, recipe, default location, category-linked
   * location, recipe ingredients — see git history for the original
   * per-item-loop version). Fetches everything the whole `items` batch could
   * need in a handful of `inArray` queries, then does the per-item location
   * resolution and requirement math in memory. Same external behavior: same
   * skips, same ConflictException when a recipe has no resolvable location.
   */
  private async buildRequirements(tx: DbClient, items: OrderLine[]) {
    const requirements: InventoryRequirement[] = [];
    const branchId = requireBranchId();

    const lines = (items || [])
      .map((item) => ({
        item,
        menuItemId: item?.menu_item_id ? String(item.menu_item_id) : "",
        quantity: Math.max(0, asNumber(item?.quantity)),
      }))
      .filter((line) => line.menuItemId && line.quantity > 0);

    if (lines.length === 0) return requirements;

    const menuItemIds = [...new Set(lines.map((l) => l.menuItemId))];

    const menuItemRows = await tx
      .select()
      .from(menuItems)
      .where(
        and(inArray(menuItems.id, menuItemIds), eq(menuItems.branch_id, branchId)),
      );
    const menuItemById = new Map<string, any>(
      menuItemRows.map((row: any) => [row.id, row]),
    );

    const recipeRows = await tx
      .select()
      .from(recipes)
      .where(
        and(
          inArray(recipes.menu_item_id, menuItemIds),
          eq(recipes.is_active, true),
          eq(recipes.branch_id, branchId),
        ),
      );
    // First-seen-per-menu-item wins — same effectively-arbitrary tie-break as
    // the old per-item `.limit(1)` when more than one active recipe exists.
    const recipeByMenuItemId = new Map<string, any>();
    for (const row of recipeRows) {
      if (!recipeByMenuItemId.has(row.menu_item_id)) {
        recipeByMenuItemId.set(row.menu_item_id, row);
      }
    }

    // Branch-wide constant — fetched once for the whole batch instead of
    // once per item.
    const [defaultLocation] = await tx
      .select()
      .from(stockLocations)
      .where(
        and(eq(stockLocations.is_default, true), eq(stockLocations.branch_id, branchId)),
      )
      .limit(1);

    const categorySlugs = [
      ...new Set(
        menuItemRows
          .map((row: any) => asText(row.main_category))
          .filter((slug: string) => Boolean(slug)),
      ),
    ];
    const linkedLocationRows = categorySlugs.length
      ? await tx
          .select()
          .from(stockLocations)
          .where(
            and(
              eq(stockLocations.is_active, true),
              eq(stockLocations.branch_id, branchId),
              inArray(stockLocations.linked_main_category_slug, categorySlugs),
            ),
          )
      : [];
    const linkedLocationBySlug = new Map<string, any>();
    for (const row of linkedLocationRows) {
      // Non-null at runtime: filtered above via inArray against categorySlugs,
      // which already excludes blanks.
      const slug = row.linked_main_category_slug as string;
      if (!linkedLocationBySlug.has(slug)) {
        linkedLocationBySlug.set(slug, row);
      }
    }

    const referencedRecipeIds = [
      ...new Set(
        lines
          .map((l) => recipeByMenuItemId.get(l.menuItemId)?.id)
          .filter((id: string | undefined): id is string => Boolean(id)),
      ),
    ];
    const ingredientRows = referencedRecipeIds.length
      ? await tx
          .select()
          .from(recipeIngredients)
          .where(
            and(
              inArray(recipeIngredients.recipe_id, referencedRecipeIds),
              eq(recipeIngredients.branch_id, branchId),
            ),
          )
      : [];
    const ingredientsByRecipeId = new Map<string, any[]>();
    for (const row of ingredientRows) {
      const list = ingredientsByRecipeId.get(row.recipe_id);
      if (list) list.push(row);
      else ingredientsByRecipeId.set(row.recipe_id, [row]);
    }

    for (const { item, menuItemId, quantity } of lines) {
      const menuItem = menuItemById.get(menuItemId);
      const recipe = recipeByMenuItemId.get(menuItemId);
      if (!recipe) {
        continue;
      }

      const linkedLocation = menuItem?.main_category
        ? linkedLocationBySlug.get(asText(menuItem.main_category))
        : undefined;

      const resolvedLocationId =
        recipe.deduct_strategy === "fixed_location" &&
        recipe.deduct_from_location_id
          ? recipe.deduct_from_location_id
          : (linkedLocation?.id ?? defaultLocation?.id ?? null);

      if (!resolvedLocationId) {
        throw new ConflictException({
          statusCode: 409,
          error: "insufficient_inventory",
          details: [
            {
              inventory_item_id: null,
              item_name: menuItem?.name || `Menu item ${menuItemId}`,
              location_id: null,
              location_name: null,
              required: quantity,
              available: 0,
              unit: "piece",
            },
          ],
        });
      }

      const ingredients = ingredientsByRecipeId.get(recipe.id) ?? [];
      for (const ingredient of ingredients) {
        const yieldQty = Math.max(1, asNumber(recipe.yield_quantity, 1));
        const wasteFactor = Number(ingredient.waste_factor ?? 1) || 1;
        const requiredQty = Math.ceil(
          (quantity * asNumber(ingredient.quantity) * wasteFactor) / yieldQty,
        );

        requirements.push({
          inventory_item_id: ingredient.inventory_item_id,
          location_id: resolvedLocationId,
          quantity: requiredQty,
          order_item_id: item.id ? String(item.id) : undefined,
          recipe_id: recipe.id,
          menu_item_id: menuItemId,
          item_name: menuItem?.name,
        });
      }
    }

    return requirements;
  }

  private requirementKey(inventoryItemId: string, locationId: string) {
    return `${inventoryItemId}:${locationId}`;
  }

  private async findShortfalls(
    tx: DbClient,
    requirements: InventoryRequirement[],
  ) {
    const aggregated = new Map<
      string,
      InventoryRequirement & { available: number }
    >();

    for (const requirement of requirements) {
      const key = this.requirementKey(
        requirement.inventory_item_id,
        requirement.location_id,
      );
      const existing = aggregated.get(key) || {
        ...requirement,
        available: 0,
      };
      existing.quantity += requirement.quantity;
      aggregated.set(key, existing);
    }

    if (aggregated.size === 0) return [];

    // One batched read for every (item, location) this batch touches instead
    // of one join query per aggregated requirement. The inArray×inArray
    // combination can overfetch (cross product) for multi-item/multi-location
    // batches, but the exact per-key lookup below only ever uses the row that
    // actually matches, so correctness is unaffected — it just trades a
    // little overfetch for far fewer round trips.
    const itemIds = [...new Set([...aggregated.values()].map((r) => r.inventory_item_id))];
    const locationIds = [...new Set([...aggregated.values()].map((r) => r.location_id))];

    const stockRows = await tx
      .select({
        inventory_item_id: inventoryStock.inventory_item_id,
        location_id: inventoryStock.location_id,
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
          eq(inventoryStock.branch_id, requireBranchId()),
          inArray(inventoryStock.inventory_item_id, itemIds),
          inArray(inventoryStock.location_id, locationIds),
        ),
      );
    const stockByKey = new Map<string, (typeof stockRows)[number]>(
      stockRows.map((row: any) => [
        this.requirementKey(row.inventory_item_id, row.location_id),
        row,
      ]),
    );

    const shortfalls: any[] = [];
    for (const requirement of aggregated.values()) {
      const stockRow = stockByKey.get(
        this.requirementKey(requirement.inventory_item_id, requirement.location_id),
      );

      const available = asNumber(stockRow?.quantity, 0);
      if (available < requirement.quantity) {
        shortfalls.push({
          inventory_item_id: requirement.inventory_item_id,
          inventory_item_name:
            stockRow?.item_name ||
            requirement.item_name ||
            `Item ${requirement.inventory_item_id}`,
          location_id: requirement.location_id,
          location_name:
            stockRow?.location_name || `Location ${requirement.location_id}`,
          required: requirement.quantity,
          available,
          unit: stockRow?.base_unit || "piece",
        });
      }
    }

    return shortfalls;
  }

  private async applyRequirements(
    tx: DbClient,
    orderId: string,
    requirements: InventoryRequirement[],
    params: {
      createdBy?: string | null;
      movementType: string;
      sign: 1 | -1;
      allowLowStock?: boolean;
    },
  ) {
    if (requirements.length === 0) return;
    const branchId = requireBranchId();

    const itemIds = [...new Set(requirements.map((r) => r.inventory_item_id))];
    const locationIds = [...new Set(requirements.map((r) => r.location_id))];

    // One batched read of every stock row this call could touch, instead of
    // a SELECT per requirement.
    const stockRows = await tx
      .select()
      .from(inventoryStock)
      .where(
        and(
          eq(inventoryStock.branch_id, branchId),
          inArray(inventoryStock.inventory_item_id, itemIds),
          inArray(inventoryStock.location_id, locationIds),
        ),
      );
    const stockRowByKey = new Map<string, (typeof stockRows)[number]>(
      stockRows.map((row: any) => [
        this.requirementKey(row.inventory_item_id, row.location_id),
        row,
      ]),
    );

    // Walk requirements in their original order — same as the old
    // per-requirement DB loop — so the low-stock check and each
    // stock_movements row's quantity_after match today's true sequential
    // ledger exactly (if two requirements share a key, the first's movement
    // reflects stock after itself alone, the second's after both). The only
    // change is that the running balance comes from an in-memory map seeded
    // by the batched read above, instead of a fresh SELECT every iteration.
    const runningByKey = new Map<string, number>();
    const movementRows: any[] = [];

    for (const requirement of requirements) {
      const key = this.requirementKey(
        requirement.inventory_item_id,
        requirement.location_id,
      );
      const quantityBefore =
        runningByKey.get(key) ?? asNumber(stockRowByKey.get(key)?.quantity, 0);
      const quantityAfter = quantityBefore + requirement.quantity * params.sign;

      // Only guard deductions (sign -1, "sale"); a reversal (sign +1,
      // "sale_reversal") is always giving stock back, so it must never be
      // blocked even if the balance is already negative from prior overselling.
      if (params.sign < 0 && !params.allowLowStock && quantityAfter < 0) {
        throw new ConflictException({
          statusCode: 409,
          error: "insufficient_inventory",
          details: [
            {
              inventory_item_id: requirement.inventory_item_id,
              inventory_item_name:
                requirement.item_name ||
                `Item ${requirement.inventory_item_id}`,
              location_id: requirement.location_id,
              location_name:
                requirement.location_name ||
                `Location ${requirement.location_id}`,
              required: requirement.quantity,
              available: quantityBefore,
              unit: "piece",
            },
          ],
        });
      }

      runningByKey.set(key, quantityAfter);
      movementRows.push({
        ...tenantInsert(),
        inventory_item_id: requirement.inventory_item_id,
        movement_type: params.movementType,
        location_id: requirement.location_id,
        quantity_delta: requirement.quantity * params.sign,
        quantity_after: quantityAfter,
        order_id: orderId,
        order_item_id: requirement.order_item_id ?? null,
        notes: null,
        created_by: params.createdBy ?? null,
        meta: {
          recipe_id: requirement.recipe_id ?? null,
          menu_item_id: requirement.menu_item_id ?? null,
        },
      });
    }

    // One batched upsert for every distinct (item, location) touched — the
    // final running balance per key — instead of a SELECT-then-UPDATE-or-INSERT
    // per requirement. inventory_stock has a unique index on
    // (branch_id, inventory_item_id, location_id) so ON CONFLICT targets it;
    // `excluded.quantity` is each row's own final balance, so a multi-row
    // upsert still applies the correct value per key even though the SET
    // clause is shared across the whole statement. On a genuine INSERT (no
    // existing row) `min_quantity` seeds to 0, same as before; on conflict
    // only `quantity` is touched, so an existing row's `min_quantity` is left
    // alone exactly like the old per-row UPDATE did.
    const stockUpserts = [...runningByKey.entries()].map(([key, quantity]) => {
      const [inventory_item_id, location_id] = key.split(":");
      return {
        ...tenantInsert(),
        inventory_item_id,
        location_id,
        quantity,
        min_quantity: 0,
      };
    });

    await tx
      .insert(inventoryStock)
      .values(stockUpserts)
      .onConflictDoUpdate({
        target: [
          inventoryStock.branch_id,
          inventoryStock.inventory_item_id,
          inventoryStock.location_id,
        ],
        set: { quantity: sql`excluded.quantity` },
      });

    await tx.insert(stockMovements).values(movementRows);
  }
}
