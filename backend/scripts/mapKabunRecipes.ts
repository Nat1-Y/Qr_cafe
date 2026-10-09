import fs from "fs";
import path from "path";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/db/drizzle";
import {
  menuItems,
  inventoryItems,
  recipes,
  recipeIngredients,
  branches,
} from "../src/db/tables";

/**
 * Maps menu items to inventory items for the Kabun business by creating
 * recipes + recipe_ingredients from the recipe sheet in
 * "scripts/recipe name Mixed Salad.txt".
 *
 * Dry-run by default (prints the full plan, writes nothing).
 *
 *   ts-node-dev --transpile-only scripts/mapKabunRecipes.ts            # dry run
 *   ts-node-dev --transpile-only scripts/mapKabunRecipes.ts --apply    # write
 *
 * Optional: --business=<uuid> --branch=<uuid> --file=<path>
 */

const DEFAULT_BUSINESS_ID = "34d09f86-925c-4f1a-b909-32f62dc94694"; // Kabun
const DEFAULT_FILE = path.resolve(__dirname, "recipe name Mixed Salad.txt");

// ---------------------------------------------------------------------------
// Name matching. Both sides are compared after normalize(): lowercase,
// alphanumerics only. Aliases map a normalized *file* name to the exact DB
// name when spelling differs too much for normalization to bridge.
// ---------------------------------------------------------------------------

const normalize = (value: string) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/** recipe_name in the sheet → menu_items.name in the DB */
const MENU_ALIASES: Record<string, string> = {
  [normalize("Kabub Special Burger")]: "Kabun Special Burger",
  [normalize("Pasta with Tomato")]: "Pasta With Tomato Sauce",
  [normalize("Pasta with Vegetable")]: "Pasta With Vegetable Sauce",
  [normalize("Pasta with Meat")]: "Pasta With Meat Sauce",
  [normalize("Rice with Veg")]: "Rice with Vegetable",
  [normalize("Rice with Meat")]: "Rice with Meat Sauce",
  [normalize("Quanta Firfir")]: "Quwanta Firfir",
  [normalize("Bozena Shero")]: "Bozena Shiro",
  [normalize("Gomen Besiga")]: "Gomen Beasega",
  [normalize("Dirkosh Q.F")]: "Dirkosh Quwanta Firfir",
  [normalize("Dirkosh T.F")]: "Dirkosh Tibs Firfir",
  [normalize("Dirkosh Firfir Fasting")]: "Dirkosh Fasting Firfir",
  [normalize("Timatim Lablab")]: "Timatim Lebleb",
  [normalize("Beyayent")]: "Beyaynet",
  [normalize("Traditional Combo B.F")]: "Traditional Combo Breakfast",
  [normalize("Ganfo")]: "Genfo",
  [normalize("Scramble Egg")]: "Scrambled Eggs",
  [normalize("Egg With Meat")]: "Scrambled Egg With Meat",
  [normalize("Fetira")]: "Normal Fetira",
  [normalize("Full")]: "Normal Ful",
  [normalize("Beef Piza")]: "Beef Pizza",
  [normalize("Kabun Pizza")]: "Kabun Special",
  [normalize("Veg Wrap")]: "Veggie wrap",
  [normalize("Beef Wrap")]: "beef rap",
  [normalize("Papaya")]: "Papaya Juice",
  [normalize("Kabun Special Juice")]: "Kabun Juice",
  [normalize("Barbq Burger")]: "Barbeque Burger",
  [normalize("Shiro Be Keba")]: "Shiro Beqebe",
};

/**
 * Prep/component recipes in the sheet that are not menu items — skipped on
 * purpose (they are sub-recipes, e.g. sauces and dough).
 */
const COMPONENT_RECIPES = new Set(
  [
    "Vegetable Recipe",
    "Tomato Sauce",
    "Pizza Sauce",
    "Home Made Mayonisse",
    "Mini Bread",
    "Pitta For Chechebsa",
    "Pitta For Pizza/fetira normal",
    "Pitta For Wrap",
    "Pitta For Special Fetira",
    "Chili",
  ].map(normalize),
);

/** ingredient name in the sheet → inventory_items.name in the DB */
const INVENTORY_ALIASES: Record<string, string> = {
  [normalize("Onion")]: "Onian",
  [normalize("Paper")]: "Papper",
  [normalize("Green Paper")]: "Papper",
  [normalize("Carrot")]: "Carrote",
  [normalize("Rice")]: "Rise",
  [normalize("Beef")]: "meat",
  [normalize("Meat")]: "meat",
  [normalize("Chicken")]: "Chiken",
  [normalize("Chicken Breast")]: "Chiken",
  [normalize("Chicken Leg")]: "Chiken",
  [normalize("Cheese")]: "Mozarila chees",
  [normalize("Vinegar")]: "vinger",
  [normalize("Tomato Ketchup")]: "kachap",
  [normalize("Ketchup")]: "kachap",
  [normalize("Oil")]: "oil 20 liter", // 4 near-duplicate oil items exist; adjust if wrong
  [normalize("Boiled Egg")]: "Egg",
  [normalize("Egg")]: "Egg",
  [normalize("Flour")]: "Flour",
  [normalize("Salt")]: "salt",
  [normalize("Suger")]: "suger",
  [normalize("Shiro")]: "Shiro",
  [normalize("Shero")]: "Shiro",
  [normalize("Injera")]: "Injera",
  [normalize("Pasta")]: "pasta",
  [normalize("Berbera")]: "Berbere",
  [normalize("Birbera")]: "Berbere",
  [normalize("Berbere")]: "Berbere",
  [normalize("Kondo Barbera")]: "kondo berebere",
  [normalize("Kondo Berbera")]: "kondo berebere",
  [normalize("Kodo Berbera")]: "kondo berebere",
  [normalize("Mitmita")]: "mitimita",
  [normalize("Mintmita")]: "mitimita",
  [normalize("Ocha")]: "oche",
  [normalize("Ayibe")]: "Ayeb",
  [normalize("Ayib")]: "Ayeb",
  [normalize("Garlic")]: "Garlic",
  [normalize("Cabbage")]: "Cabage",
  [normalize("Mushroom")]: "Meshrom",
  [normalize("B. Olive")]: "Olive",
  [normalize("Dark Soya")]: "Soyasos",
  [normalize("Slice Bread")]: "silce berad",
  [normalize("Soda")]: "soft drink",
  [normalize("Honey")]: "hanny",
  [normalize("Kincha")]: "kinche",
  [normalize("Potato")]: "Potato",
  [normalize("French Fries(Potato)")]: "Potato",
};

/**
 * The sheet spells the same ingredient several ways. Variants collapse into
 * one canonical name so we don't create near-duplicate inventory items.
 */
const CANONICAL_NEW_NAMES: Record<string, string> = {
  [normalize("Mayonisse")]: "Mayonnaise",
  [normalize("Mayonisse Dressing")]: "Mayonnaise",
  [normalize("Mayonnisse")]: "Mayonnaise",
  [normalize("Mayonise")]: "Mayonnaise",
  [normalize("Mini Bread")]: "Mini Bread",
  [normalize("Bread Mini")]: "Mini Bread",
  [normalize("Papay")]: "Papaya",
  [normalize("Veg")]: "Vegetable",
  [normalize("V.G Table")]: "Vegetable",
  [normalize("Gomene")]: "Gomen",
  [normalize("Frech Fries")]: "French Fries",
  [normalize("Chipes")]: "French Fries",
  [normalize("Chili")]: "Chilli",
  [normalize("Hum")]: "Ham",
  [normalize("Full")]: "Ful",
  [normalize("Youghert")]: "Yoghurt",
  [normalize("Youghurt")]: "Yoghurt",
  [normalize("erred")]: "Turmeric",
  [normalize("Sauce")]: "Tomato Sauce",
};

// ---------------------------------------------------------------------------
// Quantity parsing → integer in base units (g / ml / pc), per the
// recipe_ingredients.quantity convention. Original string is kept in notes.
// ---------------------------------------------------------------------------

type ParsedQty = { quantity: number; baseUnit: "g" | "ml" | "pc" };

function parseQuantity(raw: string): ParsedQty {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return { quantity: 1, baseUnit: "pc" };
  if (value.includes("portion") || value.includes("porion")) {
    const numeric = parseFloat(value);
    const portions = value.startsWith("half") ? 1 : Math.max(1, Math.round(numeric || 1));
    return { quantity: portions, baseUnit: "pc" };
  }
  const match = value.match(/^([\d.]+)\s*(gm|gram|g|kg|ml|lt|liter|litre|l|ea|pcs|pc|pic|piece)?/);
  const amount = match && match[1] ? parseFloat(match[1]) : 1;
  const unit = (match && match[2]) || "pc";
  let quantity: number;
  let baseUnit: ParsedQty["baseUnit"];
  switch (unit) {
    case "kg":
      quantity = amount * 1000;
      baseUnit = "g";
      break;
    case "gm":
    case "g":
    case "gram":
      quantity = amount;
      baseUnit = "g";
      break;
    case "lt":
    case "l":
    case "liter":
    case "litre":
      quantity = amount * 1000;
      baseUnit = "ml";
      break;
    case "ml":
      quantity = amount;
      baseUnit = "ml";
      break;
    default:
      quantity = amount;
      baseUnit = "pc";
  }
  return { quantity: Math.max(1, Math.round(quantity)), baseUnit };
}

/** unit columns for inventory items created from a parsed base unit */
const UNIT_COLUMNS: Record<ParsedQty["baseUnit"], { unit: string; base_unit: string; pieces_per_unit: number }> = {
  g: { unit: "kg", base_unit: "g", pieces_per_unit: 1000 },
  ml: { unit: "liter", base_unit: "ml", pieces_per_unit: 1000 },
  pc: { unit: "pcs", base_unit: "pc", pieces_per_unit: 1 },
};

// ---------------------------------------------------------------------------
// Recipe sheet parsing — the txt file holds several JSON arrays back to back,
// so JSON.parse on the whole file fails. Scan for top-level [...] blocks.
// ---------------------------------------------------------------------------

type SheetRecipe = {
  recipe_name: string;
  ingredients: { ingredient: string; quantity: string }[];
};

function parseRecipeSheet(filePath: string): SheetRecipe[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const all: SheetRecipe[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "]") {
      depth--;
      if (depth === 0 && start >= 0) {
        all.push(...(JSON.parse(raw.slice(start, i + 1)) as SheetRecipe[]));
        start = -1;
      }
    }
  }
  return all;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function run() {
  const apply = process.argv.includes("--apply");
  const businessId = getArg("business") || DEFAULT_BUSINESS_ID;
  const filePath = getArg("file") || DEFAULT_FILE;

  const sheet = parseRecipeSheet(filePath);
  console.log(`📄 Parsed ${sheet.length} recipes from ${path.basename(filePath)}`);

  // Resolve branch (recipes/inventory rows are branch-scoped)
  let branchId = getArg("branch");
  if (!branchId) {
    const branchRows = await db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(eq(branches.business_id, businessId));
    if (branchRows.length !== 1) {
      throw new Error(
        `Business has ${branchRows.length} branches — pass --branch=<uuid>. Found: ${branchRows
          .map((b) => `${b.name}=${b.id}`)
          .join(", ")}`,
      );
    }
    branchId = branchRows[0].id;
    console.log(`🏢 Branch: ${branchRows[0].name} (${branchId})`);
  }
  const tcols = { business_id: businessId, branch_id: branchId };

  const menuRows = await db
    .select({ id: menuItems.id, name: menuItems.name })
    .from(menuItems)
    .where(and(eq(menuItems.business_id, businessId), eq(menuItems.branch_id, branchId)));
  const invRows = await db
    .select({ id: inventoryItems.id, name: inventoryItems.name })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.business_id, businessId), eq(inventoryItems.branch_id, branchId)));
  const existingRecipeRows = await db
    .select({ menu_item_id: recipes.menu_item_id })
    .from(recipes)
    .where(and(eq(recipes.business_id, businessId), eq(recipes.branch_id, branchId)));
  const menuItemsWithRecipe = new Set(existingRecipeRows.map((r) => r.menu_item_id));

  // Index DB rows by exact name and by normalized name. On normalized
  // collisions (e.g. "Egg" vs "egg") the first row wins; exact name lookups
  // (used by alias targets) stay precise.
  const menuByExact = new Map(menuRows.map((r) => [r.name, r]));
  const menuByNorm = new Map<string, { id: string; name: string }>();
  for (const row of menuRows) {
    const key = normalize(row.name);
    if (!menuByNorm.has(key)) menuByNorm.set(key, row);
  }
  const invByExact = new Map(invRows.map((r) => [r.name, r]));
  const invByNorm = new Map<string, { id: string; name: string }>();
  for (const row of invRows) {
    const key = normalize(row.name);
    if (!invByNorm.has(key)) invByNorm.set(key, row);
  }

  const resolveMenu = (recipeName: string) => {
    const key = normalize(recipeName);
    const alias = MENU_ALIASES[key];
    if (alias) return menuByExact.get(alias) ?? menuByNorm.get(normalize(alias));
    return menuByNorm.get(key);
  };
  const resolveInventory = (ingredientName: string) => {
    const key = normalize(ingredientName);
    const alias = INVENTORY_ALIASES[key];
    if (alias) return invByExact.get(alias) ?? invByNorm.get(normalize(alias));
    return invByNorm.get(key);
  };

  // Build the plan
  type PlannedIngredient = {
    invId?: string; // existing inventory item
    createKey?: string; // normalized key of an inventory item to create
    label: string; // resolved display name
    quantity: number;
    notes: string;
  };
  type PlannedRecipe = {
    menuItemId: string;
    menuItemName: string;
    recipeName: string;
    ingredients: PlannedIngredient[];
  };

  const toCreate = new Map<string, { name: string } & (typeof UNIT_COLUMNS)["pc"]>();
  const planned: PlannedRecipe[] = [];
  const skippedComponents: string[] = [];
  const unmatchedMenu: string[] = [];
  const alreadyHadRecipe: string[] = [];
  const duplicateInSheet: string[] = [];
  const claimedMenuItems = new Set<string>();

  for (const recipe of sheet) {
    if (COMPONENT_RECIPES.has(normalize(recipe.recipe_name))) {
      skippedComponents.push(recipe.recipe_name);
      continue;
    }
    const menuItem = resolveMenu(recipe.recipe_name);
    if (!menuItem) {
      unmatchedMenu.push(recipe.recipe_name);
      continue;
    }
    if (menuItemsWithRecipe.has(menuItem.id)) {
      alreadyHadRecipe.push(`${recipe.recipe_name} → ${menuItem.name}`);
      continue;
    }
    if (claimedMenuItems.has(menuItem.id)) {
      duplicateInSheet.push(`${recipe.recipe_name} → ${menuItem.name} (already mapped, skipped)`);
      continue;
    }
    claimedMenuItems.add(menuItem.id);

    // Resolve ingredients, merging duplicates within one recipe (some sheet
    // entries list the same ingredient several times, e.g. Kabun Special Combo)
    const merged = new Map<string, PlannedIngredient>();
    for (const ing of recipe.ingredients) {
      const parsed = parseQuantity(ing.quantity);
      const canonicalName = CANONICAL_NEW_NAMES[normalize(ing.ingredient)] ?? ing.ingredient.trim();
      const existing = resolveInventory(ing.ingredient) ?? invByNorm.get(normalize(canonicalName));
      const createKey = normalize(canonicalName);
      const key = existing ? `id:${existing.id}` : `new:${createKey}`;
      if (!existing && !toCreate.has(createKey)) {
        toCreate.set(createKey, { name: canonicalName, ...UNIT_COLUMNS[parsed.baseUnit] });
      }
      const note = `qty: ${ing.quantity || "(none)"}`;
      const prior = merged.get(key);
      if (prior) {
        prior.quantity += parsed.quantity;
        prior.notes += `; ${note}`;
      } else {
        merged.set(key, {
          invId: existing?.id,
          createKey: existing ? undefined : createKey,
          label: existing ? existing.name : canonicalName,
          quantity: parsed.quantity,
          notes: note,
        });
      }
    }
    planned.push({
      menuItemId: menuItem.id,
      menuItemName: menuItem.name,
      recipeName: recipe.recipe_name,
      ingredients: [...merged.values()],
    });
  }

  // Report
  console.log(`\n✅ Recipes to create: ${planned.length}`);
  for (const p of planned) {
    console.log(`  ${p.recipeName} → [${p.menuItemName}]`);
    for (const ing of p.ingredients) {
      const marker = ing.invId ? "" : " (NEW inventory item)";
      console.log(`      • ${ing.label}${marker} — ${ing.quantity} (${ing.notes})`);
    }
  }
  console.log(`\n🆕 Inventory items to create: ${toCreate.size}`);
  for (const item of toCreate.values()) {
    console.log(`  ${item.name} (${item.unit}/${item.base_unit})`);
  }
  if (alreadyHadRecipe.length) {
    console.log(`\n⏭️  Menu items that already have a recipe (skipped): ${alreadyHadRecipe.length}`);
    alreadyHadRecipe.forEach((n) => console.log(`  ${n}`));
  }
  if (duplicateInSheet.length) {
    console.log(`\n⚠️  Duplicate sheet entries (first one won): ${duplicateInSheet.length}`);
    duplicateInSheet.forEach((n) => console.log(`  ${n}`));
  }
  if (skippedComponents.length) {
    console.log(`\n🧂 Component/prep recipes skipped (not menu items): ${skippedComponents.length}`);
    skippedComponents.forEach((n) => console.log(`  ${n}`));
  }
  if (unmatchedMenu.length) {
    console.log(`\n❌ No matching menu item (add an alias or a menu item): ${unmatchedMenu.length}`);
    unmatchedMenu.forEach((n) => console.log(`  ${n}`));
  }

  if (!apply) {
    console.log("\n🔍 Dry run — nothing written. Re-run with --apply to write to the DB.");
    return;
  }

  console.log("\n✍️  Applying...");
  await db.transaction(async (tx) => {
    const createdIds = new Map<string, string>();
    for (const [key, item] of toCreate) {
      const [row] = await tx
        .insert(inventoryItems)
        .values({
          ...tcols,
          name: item.name,
          unit: item.unit,
          base_unit: item.base_unit,
          pieces_per_unit: item.pieces_per_unit,
          notes: "Created by mapKabunRecipes script",
          meta: { source: "mapKabunRecipes" },
        })
        .returning({ id: inventoryItems.id });
      createdIds.set(key, row.id);
    }
    for (const p of planned) {
      const [recipeRow] = await tx
        .insert(recipes)
        .values({
          ...tcols,
          menu_item_id: p.menuItemId,
          name: p.recipeName,
          yield_quantity: 1,
          is_active: true,
          meta: { source: "mapKabunRecipes" },
        })
        .returning({ id: recipes.id });
      await tx.insert(recipeIngredients).values(
        p.ingredients.map((ing, index) => ({
          ...tcols,
          recipe_id: recipeRow.id,
          inventory_item_id: ing.invId ?? createdIds.get(ing.createKey!)!,
          quantity: ing.quantity,
          notes: ing.notes,
          display_order: index,
        })),
      );
    }
  });
  console.log(`✅ Done: ${planned.length} recipes, ${toCreate.size} new inventory items.`);
}

run()
  .catch((err) => {
    console.error("❌ Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
