// Demo data for trying QR self-ordering locally: staff logins, a small
// Ethiopian café menu split across printer sections, tables with QR codes and
// QR ordering switched on. Safe to re-run (idempotent). Seeds the default
// business/branch — point DATABASE_URL at a dev database, never production.
//
//   pnpm db:seed-qr-demo
import * as bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../src/db/drizzle";
import {
  branches,
  categories,
  diningTables,
  mainCategories,
  menuItemCategories,
  menuItems,
  systemSettings,
  users,
} from "../src/db/tables";
import { DEFAULT_BRANCH_ID, DEFAULT_BUSINESS_ID, ensureDefaultTenant, tcols } from "./seedTenant";
import { QR_SETTING_KEYS } from "../src/common/qr/qr-settings";

const ENROLLMENT_CODE = "BUNADEMO2026";
const WEB = (process.env.WEB_ORIGIN || "http://localhost:3000").split(",")[0].trim();

async function upsertSetting(key: string, value: string) {
  await db
    .insert(systemSettings)
    .values({ ...tcols(), key, value })
    .onConflictDoUpdate({ target: [systemSettings.branch_id, systemSettings.key], set: { value } });
}

async function ensureUser(u: {
  username: string;
  name: string;
  role: string;
  password?: string;
  pin?: string;
  branchScoped: boolean;
}) {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, u.username)).limit(1);
  if (existing) return;
  await db.insert(users).values({
    business_id: DEFAULT_BUSINESS_ID,
    branch_id: u.branchScoped ? DEFAULT_BRANCH_ID : null,
    username: u.username,
    name: u.name,
    first_name: u.name,
    role: u.role,
    password_hash: u.password ? await bcrypt.hash(u.password, 10) : null,
    pin_hash: u.pin ? await bcrypt.hash(u.pin, 10) : null,
    is_active: true,
  });
}

const MENU: Array<{
  name: string;
  price: string;
  main: string;
  group: string;
  description: string;
  prep?: number;
  notes?: string[];
}> = [
  { name: "Buna (Ethiopian coffee)", price: "40", main: "barista", group: "Hot drinks", description: "Freshly roasted, brewed in a jebena. Served with popcorn on request.", prep: 8 },
  { name: "Macchiato", price: "60", main: "barista", group: "Hot drinks", description: "Espresso marked with a little steamed milk.", prep: 4, notes: ["No sugar", "Extra hot", "Double shot"] },
  { name: "Spris", price: "55", main: "barista", group: "Hot drinks", description: "Half tea, half coffee — an Addis favourite.", prep: 5 },
  { name: "Shai (spiced tea)", price: "25", main: "barista", group: "Hot drinks", description: "Black tea with cinnamon and cloves.", prep: 3 },
  { name: "Iced latte", price: "90", main: "barista", group: "Cold drinks", description: "Espresso, cold milk and ice.", prep: 4 },
  { name: "Avocado juice", price: "90", main: "juice", group: "Fresh juice", description: "Thick, creamy avocado with a squeeze of lime.", prep: 6 },
  { name: "Spris juice (layered)", price: "110", main: "juice", group: "Fresh juice", description: "Avocado, mango and papaya in layers.", prep: 8 },
  { name: "Chechebsa", price: "140", main: "kitchen", group: "Breakfast", description: "Shredded flatbread tossed in berbere and spiced butter, with honey.", prep: 12 },
  { name: "Firfir", price: "150", main: "kitchen", group: "Breakfast", description: "Injera pieces in a rich berbere sauce.", prep: 12 },
  { name: "Ful", price: "130", main: "kitchen", group: "Breakfast", description: "Mashed fava beans with onion, tomato, egg and fresh bread.", prep: 10 },
  { name: "Shiro", price: "180", main: "kitchen", group: "Mains", description: "Silky chickpea stew, served on injera.", prep: 15 },
  { name: "Beef tibs", price: "320", main: "kitchen", group: "Mains", description: "Sautéed beef with rosemary, onion and green pepper.", prep: 18, notes: ["Not spicy", "Extra spicy", "Well done"] },
  { name: "Beyaynetu", price: "250", main: "kitchen", group: "Mains", description: "A colourful fasting platter of lentils, greens and vegetables on injera.", prep: 15 },
];

async function seedMenu() {
  const t = tcols();
  for (const [i, s] of [["barista", "Drinks"], ["juice", "Fresh juice"], ["kitchen", "Food"]].entries()) {
    await db
      .insert(mainCategories)
      .values({ ...t, slug: s[0], name: s[1], display_order: i + 1 })
      .onConflictDoNothing({ target: [mainCategories.branch_id, mainCategories.slug] });
  }
  const groups = ["Hot drinks", "Cold drinks", "Fresh juice", "Breakfast", "Mains"];
  const groupId = new Map<string, string>();
  for (const [i, name] of groups.entries()) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await db.insert(categories).values({ ...t, name, slug, display_order: i + 1 }).onConflictDoNothing({ target: [categories.branch_id, categories.slug] });
    const [row] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.branch_id, DEFAULT_BRANCH_ID), eq(categories.slug, slug)));
    groupId.set(name, row.id);
  }
  for (const m of MENU) {
    const [exists] = await db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(and(eq(menuItems.branch_id, DEFAULT_BRANCH_ID), eq(menuItems.name, m.name)))
      .limit(1);
    if (exists) continue;
    const [item] = await db
      .insert(menuItems)
      .values({
        ...t,
        name: m.name,
        price: m.price,
        main_category: m.main,
        category: m.group.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        type: "cafe",
        is_available: true,
        description: m.description,
        prep_time_minutes: m.prep ?? 0,
        meta: { predefined_notes: m.notes ?? [] },
      })
      .returning({ id: menuItems.id });
    await db.insert(menuItemCategories).values({ ...t, menu_item_id: item.id, category_id: groupId.get(m.group)! });
  }
}

async function seedTables() {
  const labels: Record<number, string> = { 1: "Terrace 1", 2: "Terrace 2", 9: "Window seat" };
  for (let n = 1; n <= 12; n++) {
    const [exists] = await db
      .select({ id: diningTables.id })
      .from(diningTables)
      .where(and(eq(diningTables.branch_id, DEFAULT_BRANCH_ID), eq(diningTables.table_number, n)))
      .limit(1);
    if (exists) continue;
    await db.insert(diningTables).values({ ...tcols(), table_number: n, label: labels[n] ?? null });
  }
}

async function main() {
  await ensureDefaultTenant();
  await db
    .update(branches)
    .set({ name: "Buna House", phone: "+251 911 234 567", enrollment_code: ENROLLMENT_CODE })
    .where(eq(branches.id, DEFAULT_BRANCH_ID));

  await ensureUser({ username: "owner", name: "Owner", role: "owner", password: "owner123", branchScoped: false });
  await ensureUser({ username: "cashier", name: "Selam", role: "cashier", password: "cashier123", pin: "1234", branchScoped: true });
  await ensureUser({ username: "waiter", name: "Dawit", role: "cafe_waiter", password: "waiter123", pin: "1234", branchScoped: true });

  await seedMenu();
  await seedTables();

  await upsertSetting(QR_SETTING_KEYS.enabled, "true");
  await upsertSetting(QR_SETTING_KEYS.welcomeMessage, "Selam! Order from your table — we'll bring it right over.");
  await upsertSetting(
    "printer_department_routing",
    JSON.stringify({ barista: { printer: "Barista printer", stations: [] }, kitchen: { printer: "Kitchen printer", stations: [] } }),
  );

  const tables = await db
    .select({ n: diningTables.table_number, token: diningTables.qr_token, label: diningTables.label })
    .from(diningTables)
    .where(eq(diningTables.branch_id, DEFAULT_BRANCH_ID))
    .orderBy(diningTables.table_number);

  console.log("\nQR demo ready — branch \"Buna House\"\n");
  console.log("  Owner dashboard  :", `${WEB}/login`, " (owner / owner123)");
  console.log("  Web cashier      :", `${WEB}/cashier`, ` (setup code ${ENROLLMENT_CODE}, then Selam / cashier123)`);
  console.log("  Waiter app       :", `${WEB}/waiter`, ` (setup code ${ENROLLMENT_CODE}, then Dawit / PIN 1234)`);
  console.log("\n  Guest QR links:");
  for (const tb of tables) console.log(`    Table ${String(tb.n).padStart(2)}${tb.label ? ` (${tb.label})` : ""}: ${WEB}/t/${tb.token}`);
  console.log("");
}

main()
  .catch((err) => {
    console.error("Seeding the QR demo failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
