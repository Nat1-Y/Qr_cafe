import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../../db/drizzle";
import { menuItems } from "../../db/tables/menu-items.table";
import { menuItemCategories } from "../../db/tables/menu-item-categories.table";
import { categories } from "../../db/tables/categories.table";
import { mainCategories } from "../../db/tables/main-categories.table";
import { order_items } from "../../db/tables/order-items.table";
import { orders } from "../../db/tables/orders.table";
import { InventoryService } from "../inventory/inventory.service";
import { menuMainCategory, menuUnitPrice } from "../../common/ordering/order-line";
import { requireBranchId } from "../../common/tenant/tenant-context";

export type Availability = "in_stock" | "low" | "out";

/** One menu item as a guest sees it — no cost, recipe, stock count or SKU. */
export interface GuestMenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  image_url: string | null;
  prep_minutes: number | null;
  availability: Availability;
  popular: boolean;
  note_presets: string[];
}

export interface GuestMenuGroup {
  key: string;
  name: string;
  items: GuestMenuItem[];
}

export interface GuestMenuSection {
  key: string;
  name: string;
  groups: GuestMenuGroup[];
}

export interface GuestMenu {
  sections: GuestMenuSection[];
}

const POPULAR_WINDOW_DAYS = 30;
const POPULAR_MAX = 6;
const POPULAR_MIN_QTY = 3;
const POPULAR_CACHE_MS = 5 * 60_000;

const slugify = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/(^-|-$)/g, "");

const titleCase = (value: string) =>
  String(value || "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Only plain http(s)/relative URLs go in the payload; inline data: images are served separately. */
export function isInlineImage(url: unknown): boolean {
  return typeof url === "string" && url.startsWith("data:");
}

@Injectable()
export class CustomerMenuService {
  private readonly popularCache = new Map<string, { at: number; ids: Set<string> }>();

  constructor(private readonly inventory: InventoryService) {}

  /** The guest menu for the current branch context. */
  async build(opts: { showPrices: boolean; imageUrlFor: (itemId: string) => string }): Promise<GuestMenu> {
    const branchId = requireBranchId();

    const rows = await db
      .select({ item: menuItems, category: categories })
      .from(menuItems)
      .leftJoin(menuItemCategories, eq(menuItems.id, menuItemCategories.menu_item_id))
      .leftJoin(categories, eq(menuItemCategories.category_id, categories.id))
      .where(
        and(
          eq(menuItems.branch_id, branchId),
          eq(menuItems.type, "cafe"),
          eq(menuItems.is_available, true),
        ),
      )
      .orderBy(asc(menuItems.name));

    const sectionRows = await db
      .select({ slug: mainCategories.slug, name: mainCategories.name, order: mainCategories.display_order })
      .from(mainCategories)
      .where(and(eq(mainCategories.branch_id, branchId), eq(mainCategories.is_active, true)));
    const sectionMeta = new Map(sectionRows.map((r) => [r.slug, r]));

    const availability = await this.availabilityMap();
    const popular = await this.popularIds(branchId);

    // Collapse the item x category join into one entry per item.
    type Acc = { item: typeof menuItems.$inferSelect; group: { name: string; order: number } | null };
    const byId = new Map<string, Acc>();
    for (const row of rows) {
      const acc = byId.get(row.item.id) ?? { item: row.item, group: null };
      const c = row.category;
      if (c && c.is_active && c.type !== "tag") {
        const candidate = { name: c.name, order: c.display_order ?? 0 };
        if (!acc.group || candidate.order < acc.group.order) acc.group = candidate;
      }
      byId.set(row.item.id, acc);
    }

    const sections = new Map<string, { name: string; order: number; groups: Map<string, GuestMenuGroup & { order: number }> }>();
    for (const { item, group } of byId.values()) {
      const main = menuMainCategory(item);
      const sectionKey = slugify(main) || "other";
      const meta = sectionMeta.get(sectionKey);
      const section =
        sections.get(sectionKey) ??
        { name: meta?.name || titleCase(main), order: meta?.order ?? 1000, groups: new Map() };
      sections.set(sectionKey, section);

      const groupName = group?.name || (item.category ? titleCase(item.category) : section.name);
      const groupKey = `${sectionKey}--${slugify(groupName) || "more"}`;
      const g = section.groups.get(groupKey) ?? { key: groupKey, name: groupName, order: group?.order ?? 1000, items: [] };
      section.groups.set(groupKey, g);

      const price = menuUnitPrice(item.price);
      const notes = (item.meta as { predefined_notes?: unknown } | null)?.predefined_notes;
      g.items.push({
        id: item.id,
        name: item.name,
        description: item.description?.trim() || null,
        price: opts.showPrices && Number.isFinite(price) ? price : null,
        image_url: isInlineImage(item.image_url)
          ? opts.imageUrlFor(item.id)
          : item.image_url?.trim() || null,
        prep_minutes: item.prep_time_minutes && item.prep_time_minutes > 0 ? item.prep_time_minutes : null,
        availability: availability.get(item.id) ?? "in_stock",
        popular: popular.has(item.id),
        note_presets: Array.isArray(notes)
          ? notes.filter((n): n is string => typeof n === "string" && n.trim() !== "").slice(0, 8)
          : [],
      });
    }

    return {
      sections: [...sections.entries()]
        .sort((a, b) => a[1].order - b[1].order || a[1].name.localeCompare(b[1].name))
        .map(([key, s]) => ({
          key,
          name: s.name,
          groups: [...s.groups.values()]
            .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
            .map(({ key: k, name, items }) => ({ key: k, name, items })),
        })),
    };
  }

  /** menu_item_id → availability for items that have a recipe (others are in stock). */
  async availabilityMap(): Promise<Map<string, Availability>> {
    const list = await this.inventory.menuAvailability();
    const map = new Map<string, Availability>();
    for (const e of list as Array<{ menu_item_id: string; status: Availability }>) {
      map.set(String(e.menu_item_id), e.status);
    }
    return map;
  }

  /** Inline (data:) image bytes for one item, or null. */
  async inlineImage(itemId: string): Promise<{ mime: string; bytes: Buffer } | null> {
    const [row] = await db
      .select({ image_url: menuItems.image_url })
      .from(menuItems)
      .where(and(eq(menuItems.id, itemId), eq(menuItems.branch_id, requireBranchId())))
      .limit(1);
    const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(row?.image_url ?? "");
    if (!m) return null;
    return { mime: m[1], bytes: Buffer.from(m[2], "base64") };
  }

  /** A strong, stable tag for the payload — the menu endpoint's ETag. */
  static etagOf(payload: unknown): string {
    return `"${createHash("sha1").update(JSON.stringify(payload)).digest("base64url")}"`;
  }

  private async popularIds(branchId: string): Promise<Set<string>> {
    const cached = this.popularCache.get(branchId);
    if (cached && Date.now() - cached.at < POPULAR_CACHE_MS) return cached.ids;

    const since = new Date(Date.now() - POPULAR_WINDOW_DAYS * 86_400_000);
    const qty = sql<number>`sum(${order_items.quantity})`;
    const rows = await db
      .select({ id: order_items.menu_item_id, qty })
      .from(order_items)
      .innerJoin(orders, eq(order_items.order_id, orders.id))
      .where(
        and(
          eq(orders.branch_id, branchId),
          gte(orders.created_at, since),
          inArray(orders.status, ["pending", "done"]),
        ),
      )
      .groupBy(order_items.menu_item_id)
      .orderBy(desc(qty))
      .limit(POPULAR_MAX);

    const ids = new Set(
      rows.filter((r) => r.id && Number(r.qty) >= POPULAR_MIN_QTY).map((r) => String(r.id)),
    );
    this.popularCache.set(branchId, { at: Date.now(), ids });
    return ids;
  }
}
