import { Injectable, UnauthorizedException } from "@nestjs/common";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../../db/drizzle";
import { customerSessions } from "../../db/tables/customer-sessions.table";
import {
  generateSessionToken,
  hashToken,
  isWellFormedToken,
} from "../../common/qr/qr-token";
import type { TableAccess } from "./customer-access.service";

// Sliding: every use pushes expiry out again, so a guest lingering over coffee
// keeps their orders; a phone that walks away loses access after this long.
export const SESSION_TTL_MS = 12 * 60 * 60_000;
const TOUCH_EVERY_MS = 60_000;

export const SESSION_ENDED_MESSAGE =
  "Your visit timed out. Scan the QR code on your table again.";

export interface CustomerSession {
  id: string;
  tableId: string;
  branchId: string;
  expiresAt: Date;
}

@Injectable()
export class CustomerSessionService {
  /**
   * Resume the session the browser already holds (same table, not expired) or
   * start a new one. Returns the raw token only when a new one was minted.
   */
  async startOrResume(
    access: TableAccess,
    presented: string | null | undefined,
    userAgent: string | undefined,
  ): Promise<{ session: CustomerSession; token: string }> {
    if (presented && isWellFormedToken(presented)) {
      const existing = await this.find(access, presented);
      if (existing) {
        const touched = await this.touch(existing, true);
        return { session: touched, token: presented };
      }
    }

    const token = generateSessionToken();
    const now = new Date();
    const [row] = await db
      .insert(customerSessions)
      .values({
        business_id: access.businessId,
        branch_id: access.branchId,
        table_id: access.tableId,
        token_hash: hashToken(token),
        user_agent_hash: userAgent ? hashToken(userAgent.slice(0, 512)) : null,
        created_at: now,
        last_seen_at: now,
        expires_at: new Date(now.getTime() + SESSION_TTL_MS),
      })
      .returning();
    return { session: this.toSession(row), token };
  }

  /** The session for a guest request, or 401. Must belong to the scanned table. */
  async require(access: TableAccess, presented: string | null | undefined): Promise<CustomerSession> {
    if (!presented || !isWellFormedToken(presented)) {
      throw new UnauthorizedException(SESSION_ENDED_MESSAGE);
    }
    const existing = await this.find(access, presented);
    if (!existing) throw new UnauthorizedException(SESSION_ENDED_MESSAGE);
    return this.touch(existing, false);
  }

  private async find(access: TableAccess, token: string) {
    const [row] = await db
      .select()
      .from(customerSessions)
      .where(
        and(
          eq(customerSessions.token_hash, hashToken(token)),
          eq(customerSessions.branch_id, access.branchId),
          eq(customerSessions.table_id, access.tableId),
          gt(customerSessions.expires_at, new Date()),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  // Throttled: a busy guest polling every 15s shouldn't write on every read.
  private async touch(row: typeof customerSessions.$inferSelect, force: boolean) {
    const now = new Date();
    if (!force && now.getTime() - new Date(row.last_seen_at).getTime() < TOUCH_EVERY_MS) {
      return this.toSession(row);
    }
    const [updated] = await db
      .update(customerSessions)
      .set({ last_seen_at: now, expires_at: new Date(now.getTime() + SESSION_TTL_MS) })
      .where(eq(customerSessions.id, row.id))
      .returning();
    return this.toSession(updated ?? row);
  }

  private toSession(row: typeof customerSessions.$inferSelect): CustomerSession {
    return {
      id: row.id,
      tableId: row.table_id,
      branchId: row.branch_id,
      expiresAt: new Date(row.expires_at),
    };
  }
}
