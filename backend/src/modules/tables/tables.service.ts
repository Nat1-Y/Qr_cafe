import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/drizzle";
import { diningTables, users } from "../../db/schema";
import { requireBranchId, tenantInsert } from "../../common/tenant/tenant-context";
import { generateQrToken } from "../../common/qr/qr-token";

// Guest-facing name on the QR card/app ("Terrace 4"); blank clears it.
function cleanLabel(value: unknown): string | null {
  const label = String(value ?? "")
    .replace(/<[^>]*>?/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return label || null;
}

const isOn = (v: unknown) => v === true || v === "true";

/**
 * The waiter a table is assigned to: an active staff member of this branch,
 * or null ("" / null clears the assignment). Rejects anyone else, so a table
 * can never point at another branch's user.
 */
async function resolveAssignedWaiter(value: unknown): Promise<string | null> {
  if (value == null || value === "") return null;
  const id = String(value);
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, id), eq(users.branch_id, requireBranchId()), eq(users.is_active, true)))
    .limit(1);
  if (!row) throw new BadRequestException("Choose a waiter who works at this branch.");
  return row.id;
}

const waiterName = sql<string | null>`coalesce(nullif(trim(concat_ws(' ', ${users.first_name}, ${users.last_name})), ''), ${users.name}, ${users.username})`;

@Injectable()
export class TablesService {
  /** Tables with the assigned waiter's name, for staff screens. */
  async findAll() {
    const rows = await db
      .select({ table: diningTables, assigned_waiter_name: waiterName })
      .from(diningTables)
      .leftJoin(users, eq(diningTables.assigned_waiter_id, users.id))
      .where(eq(diningTables.branch_id, requireBranchId()))
      .orderBy(asc(diningTables.table_number));
    return rows.map((r) => ({ ...r.table, assigned_waiter_name: r.table.assigned_waiter_id ? r.assigned_waiter_name : null }));
  }

  async findById(id: string) {
    const [row] = await db
      .select()
      .from(diningTables)
      .where(and(eq(diningTables.id, id), eq(diningTables.branch_id, requireBranchId())))
      .limit(1);
    if (!row) throw new NotFoundException("Table not found");
    return row;
  }

  async create(payload: any) {
    const tableNumber = Number(payload?.table_number ?? payload?.number);
    if (!tableNumber || tableNumber < 1)
      throw new BadRequestException("Enter a table number.");

    const [created] = await db
      .insert(diningTables)
      .values({
        ...tenantInsert(),
        id: payload?.id,
        table_number: tableNumber,
        status: payload?.status ?? "available",
        ...(payload?.label !== undefined ? { label: cleanLabel(payload.label) } : {}),
        ...(payload?.qr_enabled !== undefined ? { qr_enabled: isOn(payload.qr_enabled) } : {}),
        ...(payload?.assigned_waiter_id !== undefined
          ? { assigned_waiter_id: await resolveAssignedWaiter(payload.assigned_waiter_id) }
          : {}),
      })
      .returning();

    return created;
  }

  async update(id: string, payload: any) {
    await this.findById(id);
    const updates: Record<string, any> = { updated_at: new Date() };

    if (payload?.table_number !== undefined) {
      const n = Number(payload.table_number);
      if (!n || n < 1) throw new BadRequestException("Enter a table number.");
      updates.table_number = n;
    }

    if (payload?.status !== undefined) {
      updates.status = String(payload.status);
    }

    if (payload?.label !== undefined) updates.label = cleanLabel(payload.label);

    // Owner switch: turn QR ordering off for just this table.
    if (payload?.qr_enabled !== undefined) updates.qr_enabled = isOn(payload.qr_enabled);

    // The waiter responsible for this table (QR orders are attributed to them).
    if (payload?.assigned_waiter_id !== undefined) {
      updates.assigned_waiter_id = await resolveAssignedWaiter(payload.assigned_waiter_id);
    }

    const [updated] = await db
      .update(diningTables)
      .set(updates)
      .where(and(eq(diningTables.id, id), eq(diningTables.branch_id, requireBranchId())))
      .returning();

    if (!updated) throw new NotFoundException("Table not found");
    return updated;
  }

  /**
   * New QR code for a table. The old token stops resolving immediately, so
   * every printed card for this table stops working — the UI confirms first.
   */
  async rotateQr(id: string) {
    await this.findById(id);
    const [updated] = await db
      .update(diningTables)
      .set({ qr_token: generateQrToken(), qr_rotated_at: new Date(), updated_at: new Date() })
      .where(and(eq(diningTables.id, id), eq(diningTables.branch_id, requireBranchId())))
      .returning();
    if (!updated) throw new NotFoundException("Table not found");
    return updated;
  }

  async remove(id: string) {
    const [deleted] = await db
      .delete(diningTables)
      .where(and(eq(diningTables.id, id), eq(diningTables.branch_id, requireBranchId())))
      .returning();
    if (!deleted) throw new NotFoundException("Table not found");
    return deleted;
  }

  async syncBulk(tables: any[]) {
    const idMapping: Record<string, string> = {};

    for (const t of tables) {
      const tableNumber = Number(t?.table_number ?? t?.number);
      if (!tableNumber || tableNumber < 1) continue;

      const targetId = t.id;
      if (targetId) {
        try {
          await this.update(String(targetId), t);
        } catch {
          await this.create({ ...t, id: String(targetId) });
        }
      } else {
        await this.create(t);
      }
    }

    return idMapping;
  }
}
