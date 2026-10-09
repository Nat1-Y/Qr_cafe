import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "../../db/drizzle";
import { staff_penalties, users } from "../../db/schema";
import {
  getTenant,
  requireBranchId,
  tenantInsert,
} from "../../common/tenant/tenant-context";

export const SEVERITY_LEVELS = [
  "verbal_warning",
  "written_warning",
  "fine",
  "suspension",
  "other",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function employeeDisplayName(user: any): string {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  return name || user?.name || user?.username || "Employee";
}

@Injectable()
export class StaffPenaltiesService {
  private normalizeSeverity(value: any): string {
    const s = String(value || "").trim().toLowerCase();
    if (!SEVERITY_LEVELS.includes(s as any)) {
      throw new BadRequestException(
        `Invalid severity. Expected one of: ${SEVERITY_LEVELS.join(", ")}`,
      );
    }
    return s;
  }

  private normalizeAmount(value: any): number | null {
    if (value === undefined || value === null || value === "") return null;
    const amount = Math.round(Number(value));
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException("Amount must be a non-negative number");
    }
    return amount;
  }

  private parseDate(value: any): Date | null {
    if (value === undefined || value === null || value === "") return null;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) {
      throw new BadRequestException("Invalid date");
    }
    return dt;
  }

  private async resolveEmployee(employeeId: any) {
    if (typeof employeeId !== "string" || !UUID_RE.test(employeeId)) {
      throw new BadRequestException("A valid employee_id is required");
    }
    const [employee] = await db
      .select()
      .from(users)
      .where(
        and(eq(users.id, employeeId), eq(users.branch_id, requireBranchId())),
      )
      .limit(1);
    if (!employee) throw new BadRequestException("Employee not found");
    return employee;
  }

  async findAll(
    opts: { employee_id?: string; severity?: string; from?: string; to?: string } = {},
  ) {
    const filters = [
      eq(staff_penalties.branch_id, requireBranchId()),
      isNull(staff_penalties.deleted_at),
    ];

    if (opts.employee_id) {
      filters.push(eq(staff_penalties.employee_id, opts.employee_id));
    }
    if (opts.severity) {
      filters.push(eq(staff_penalties.severity, this.normalizeSeverity(opts.severity)));
    }
    const from = this.parseDate(opts.from);
    if (from) filters.push(gte(staff_penalties.occurred_at, from));
    const to = this.parseDate(opts.to);
    if (to) filters.push(lte(staff_penalties.occurred_at, to));

    return db
      .select()
      .from(staff_penalties)
      .where(and(...filters))
      .orderBy(desc(staff_penalties.occurred_at), desc(staff_penalties.created_at));
  }

  async findById(id: string) {
    if (!UUID_RE.test(id)) throw new NotFoundException("Penalty not found");
    const [row] = await db
      .select()
      .from(staff_penalties)
      .where(
        and(
          eq(staff_penalties.id, id),
          eq(staff_penalties.branch_id, requireBranchId()),
          isNull(staff_penalties.deleted_at),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException("Penalty not found");
    return row;
  }

  async create(payload: any) {
    const employee = await this.resolveEmployee(payload?.employee_id);
    const severity = this.normalizeSeverity(payload?.severity);
    const reason = String(payload?.reason || "").trim();
    if (!reason) throw new BadRequestException("A reason is required");
    const amount = this.normalizeAmount(payload?.amount);
    const tenant = getTenant();

    const [created] = await db
      .insert(staff_penalties)
      .values({
        ...tenantInsert(),
        employee_id: employee.id,
        employee_name: employeeDisplayName(employee),
        severity,
        reason,
        amount,
        occurred_at: this.parseDate(payload?.occurred_at) ?? new Date(),
        recorded_by: tenant?.userId ?? null,
        recorded_by_name: tenant?.username ?? null,
      })
      .returning();

    return created;
  }

  async update(id: string, payload: any) {
    const current = await this.findById(id);
    const updates: Record<string, any> = {
      updated_at: new Date(),
      version: (current.version ?? 1) + 1,
    };

    if (payload?.employee_id !== undefined) {
      const employee = await this.resolveEmployee(payload.employee_id);
      updates.employee_id = employee.id;
      updates.employee_name = employeeDisplayName(employee);
    }
    if (payload?.severity !== undefined) {
      updates.severity = this.normalizeSeverity(payload.severity);
    }
    if (payload?.reason !== undefined) {
      const reason = String(payload.reason || "").trim();
      if (!reason) throw new BadRequestException("A reason is required");
      updates.reason = reason;
    }
    if (payload?.amount !== undefined) {
      updates.amount = this.normalizeAmount(payload.amount);
    }
    if (payload?.occurred_at !== undefined) {
      const dt = this.parseDate(payload.occurred_at);
      if (dt) updates.occurred_at = dt;
    }

    const [updated] = await db
      .update(staff_penalties)
      .set(updates)
      .where(
        and(
          eq(staff_penalties.id, id),
          eq(staff_penalties.branch_id, requireBranchId()),
        ),
      )
      .returning();

    if (!updated) throw new NotFoundException("Penalty not found");
    return updated;
  }

  async remove(id: string) {
    await this.findById(id);
    const [deleted] = await db
      .update(staff_penalties)
      .set({ deleted_at: new Date(), updated_at: new Date() })
      .where(
        and(
          eq(staff_penalties.id, id),
          eq(staff_penalties.branch_id, requireBranchId()),
        ),
      )
      .returning();
    return deleted;
  }

  // Total penalties for the branch within an optional date range, broken down
  // per employee (the owner's primary aggregate view) and per severity.
  async summary(opts: { from?: string; to?: string } = {}) {
    const filters = [
      eq(staff_penalties.branch_id, requireBranchId()),
      isNull(staff_penalties.deleted_at),
    ];
    const from = this.parseDate(opts.from);
    if (from) filters.push(gte(staff_penalties.occurred_at, from));
    const to = this.parseDate(opts.to);
    if (to) filters.push(lte(staff_penalties.occurred_at, to));

    const [employeeRows, severityRows] = await Promise.all([
      db
        .select({
          employee_id: staff_penalties.employee_id,
          employee_name: staff_penalties.employee_name,
          amount: sql<number>`COALESCE(SUM(${staff_penalties.amount}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(staff_penalties)
        .where(and(...filters))
        .groupBy(staff_penalties.employee_id, staff_penalties.employee_name),
      db
        .select({
          severity: staff_penalties.severity,
          amount: sql<number>`COALESCE(SUM(${staff_penalties.amount}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(staff_penalties)
        .where(and(...filters))
        .groupBy(staff_penalties.severity),
    ]);

    const byEmployee = employeeRows
      .map((r) => ({
        employee_id: r.employee_id,
        employee_name: r.employee_name,
        amount: Number(r.amount) || 0,
        count: Number(r.count) || 0,
      }))
      .sort((a, b) => b.count - a.count);

    const bySeverity: Record<string, { amount: number; count: number }> = {};
    let total = 0;
    let count = 0;
    for (const r of severityRows) {
      const amt = Number(r.amount) || 0;
      const c = Number(r.count) || 0;
      bySeverity[r.severity] = { amount: amt, count: c };
      total += amt;
      count += c;
    }

    return { total, count, byEmployee, bySeverity };
  }
}
