import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { OrdersGateway } from "./orders.gateway";

export type AssistType = "call_waiter" | "request_bill";

export interface AssistRequest {
  id: string;
  type: AssistType;
  table_number: number;
  table_label: string | null;
  /** The table's assigned waiter, so their app can show only their tables. */
  waiter_id: string | null;
  waiter_name: string | null;
  order_numbers: number[];
  created_at: string;
}

// Requests are short-lived alerts, not records: they live here for this long
// (or until a staff member dismisses one) and are pushed live to the branch.
const TTL_MS = 30 * 60_000;

/**
 * Guest "Call waiter" / "Ask for the bill" requests. Kept in memory per branch
 * (one backend instance today) so staff screens that connect or poll late
 * still see open requests; the socket push makes them instant. A restart drops
 * open requests — acceptable for a "please come over" nudge.
 */
@Injectable()
export class AssistService {
  private readonly byBranch = new Map<string, AssistRequest[]>();

  constructor(private readonly gateway: OrdersGateway) {}

  raise(
    branchId: string,
    input: Omit<AssistRequest, "id" | "created_at">,
  ): AssistRequest {
    const list = this.live(branchId);
    // One open request per table+type: a second tap refreshes it, not stacks it.
    const kept = list.filter(
      (r) => !(r.table_number === input.table_number && r.type === input.type),
    );
    const request: AssistRequest = {
      ...input,
      id: randomUUID(),
      created_at: new Date().toISOString(),
    };
    kept.push(request);
    this.byBranch.set(branchId, kept);
    this.gateway.notifyAssist(branchId, request);
    return request;
  }

  list(branchId: string): AssistRequest[] {
    return [...this.live(branchId)].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  dismiss(branchId: string, id: string): boolean {
    const list = this.live(branchId);
    const next = list.filter((r) => r.id !== id);
    if (next.length === list.length) return false;
    this.byBranch.set(branchId, next);
    this.gateway.notifyAssistDismissed(branchId, id);
    return true;
  }

  private live(branchId: string): AssistRequest[] {
    const cutoff = Date.now() - TTL_MS;
    const list = (this.byBranch.get(branchId) ?? []).filter(
      (r) => new Date(r.created_at).getTime() > cutoff,
    );
    this.byBranch.set(branchId, list);
    return list;
  }
}
