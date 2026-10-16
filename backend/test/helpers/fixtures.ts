import { randomBytes, randomUUID, createHash } from "crypto";
import { db } from "../../src/db/drizzle";
import {
  businesses,
  branches,
  branchDevices,
  users,
  mainCategories,
  categories,
  menuItems,
  menuItemCategories,
  diningTables,
  systemSettings,
} from "../../src/db/tables";
import { generateQrToken } from "../../src/common/qr/qr-token";
import { QR_SETTING_KEYS } from "../../src/common/qr/qr-settings";

export interface BranchFixture {
  businessId: string;
  branchId: string;
  waiterId: string;
  cashierId: string;
  deviceToken: string;
  tableToken: string;
  tableNumber: number;
  offTableToken: string;
  items: { macchiato: string; firfir: string; juice: string; hidden: string; tea: string };
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** One branch with a small menu, QR ordering on, a POS device and two staff. */
export async function seedBranch(
  opts: { businessId?: string; name?: string; qrEnabled?: boolean } = {},
): Promise<BranchFixture> {
  const businessId = opts.businessId ?? randomUUID();
  if (!opts.businessId) {
    await db.insert(businesses).values({ id: businessId, name: "Test Biz", slug: `biz-${businessId.slice(0, 8)}` });
  }
  const branchId = randomUUID();
  const t = { business_id: businessId, branch_id: branchId };
  await db.insert(branches).values({
    id: branchId,
    business_id: businessId,
    name: opts.name ?? "Buna Test Café",
    slug: `br-${branchId.slice(0, 8)}`,
    phone: "+251 911 000 000",
  });

  const waiterId = randomUUID();
  const cashierId = randomUUID();
  await db.insert(users).values([
    { id: waiterId, ...t, name: "Waiter W", username: `w-${waiterId.slice(0, 6)}`, role: "cafe_waiter" },
    { id: cashierId, ...t, name: "Cashier C", username: `c-${cashierId.slice(0, 6)}`, role: "cashier" },
  ]);

  const deviceToken = randomBytes(32).toString("hex");
  await db.insert(branchDevices).values({
    business_id: businessId,
    branch_id: branchId,
    name: "POS",
    token_hash: sha256(deviceToken),
    status: "active",
  });

  await db.insert(mainCategories).values([
    { ...t, name: "Drinks", slug: "barista", display_order: 1 },
    { ...t, name: "Food", slug: "kitchen", display_order: 2 },
  ]);
  const [hot] = await db.insert(categories).values({ ...t, name: "Hot drinks", slug: "hot-drinks", display_order: 1 }).returning();
  const [breakfast] = await db.insert(categories).values({ ...t, name: "Breakfast", slug: "breakfast", display_order: 2 }).returning();

  const item = (name: string, price: string, main: string, extra: Partial<typeof menuItems.$inferInsert> = {}) => ({
    ...t,
    id: randomUUID(),
    name,
    price,
    main_category: main,
    type: "cafe",
    is_available: true,
    ...extra,
  });
  const macchiato = item("Macchiato", "60.00", "barista", {
    description: "Espresso with a little foam",
    prep_time_minutes: 5,
    meta: { predefined_notes: ["No sugar", "Extra hot"] },
  });
  const tea = item("Spris tea", "35.00", "barista");
  const firfir = item("Firfir", "150.00", "kitchen", { description: "Injera with spiced sauce" });
  const juice = item("Avocado juice", "45.50", "juice");
  const hidden = item("Old special", "90.00", "kitchen", { is_available: false });
  await db.insert(menuItems).values([macchiato, tea, firfir, juice, hidden]);
  await db.insert(menuItemCategories).values([
    { ...t, menu_item_id: macchiato.id, category_id: hot.id },
    { ...t, menu_item_id: tea.id, category_id: hot.id },
    { ...t, menu_item_id: firfir.id, category_id: breakfast.id },
  ]);

  const tableToken = generateQrToken();
  const offTableToken = generateQrToken();
  await db.insert(diningTables).values([
    { ...t, table_number: 7, qr_token: tableToken, label: "Terrace 7", assigned_waiter_id: waiterId },
    { ...t, table_number: 8, qr_token: offTableToken, qr_enabled: false },
  ]);

  await db.insert(systemSettings).values({
    ...t,
    key: QR_SETTING_KEYS.enabled,
    value: opts.qrEnabled === false ? "false" : "true",
  });

  return {
    businessId,
    branchId,
    waiterId,
    cashierId,
    deviceToken,
    tableToken,
    tableNumber: 7,
    offTableToken,
    items: { macchiato: macchiato.id, firfir: firfir.id, juice: juice.id, hidden: hidden.id, tea: tea.id },
  };
}

export async function setBranchSetting(f: BranchFixture, key: string, value: string) {
  await db
    .insert(systemSettings)
    .values({ business_id: f.businessId, branch_id: f.branchId, key, value })
    .onConflictDoUpdate({ target: [systemSettings.branch_id, systemSettings.key], set: { value } });
}
