"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Building2, RefreshCw, Search } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cashierServices } from "@/lib/cashier/api";

type PaymentFilter = "active" | "paid" | "all";

function formatCurrency(n: any): string {
  const v = Number(n) || 0;
  return `${v.toLocaleString()} Br`;
}

/** An order still owes money unless it's cancelled or already confirmed paid. */
function isOrderUnpaid(order: any): boolean {
  const status = String(order?.status || "").toLowerCase();
  const paymentStatus = String(order?.payment_status || "").toLowerCase();
  return status !== "cancelled" && status !== "paid" && paymentStatus !== "paid";
}

function clockTime(iso: any): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Read-only view of organization orders for the cashier/waiter portal —
 * shows the cashier/waiter why an order they can see isn't in their normal
 * payment queue (it's billed to an organization's credit account instead).
 * Never creates or confirms one: orders get attached to an organization from
 * the desktop POS, and only the owner can confirm the credit deduction, from
 * the web admin dashboard or the desktop app's Organizations screen.
 */
export default function CashierOrganizationOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  const [orgFilter, setOrgFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("active");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const orgsRes: any = await cashierServices.organizations.getAll();
      const orgsPayload = orgsRes?.data ?? orgsRes;
      const orgs =
        orgsPayload?.data?.organizations ?? orgsPayload?.organizations ?? [];
      const orgList = Array.isArray(orgs) ? orgs : [];
      setOrganizations(orgList);

      const results = await Promise.allSettled(
        orgList.map(async (org: any) => {
          const res: any = await cashierServices.organizations.getOrders(org.id);
          const payload = res?.data ?? res;
          const list = payload?.data?.orders ?? payload?.orders ?? [];
          return (Array.isArray(list) ? list : []).map((o: any) => ({
            ...o,
            __orgId: org.id,
            __orgName: org.name,
          }));
        }),
      );
      const merged = results
        .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
        .flatMap((r) => r.value);
      merged.sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );
      setOrders(merged);
    } catch {
      toast.error("Failed to load organization orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (orgFilter !== "all" && String(o.__orgId) !== orgFilter) return false;
      if (paymentFilter === "active" && !isOrderUnpaid(o)) return false;
      if (paymentFilter === "paid" && isOrderUnpaid(o)) return false;
      if (term) {
        const haystack = `${o.order_number ?? ""} ${o.__orgName ?? ""} ${
          o.meta?.org_customer_name ?? ""
        } ${o.meta?.org_customer_phone ?? ""} ${o.meta?.org_customer_notes ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [orders, orgFilter, paymentFilter, search]);

  const activeCount = useMemo(() => orders.filter(isOrderUnpaid).length, [orders]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Organization Orders
          </CardTitle>
          <CardDescription>
            Billed to that organization&apos;s credit account, not collected as
            cash. Only the owner can confirm one.
          </CardDescription>
          <CardAction className="flex items-center gap-2">
            <Badge variant="info" className="text-xs font-bold">
              {activeCount} active
            </Badge>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/cashier">
                <ArrowLeft className="size-4" />
                Queue
              </Link>
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Order #, org, or customer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="all">All organizations</option>
              {organizations.map((org) => (
                <option key={org.id} value={String(org.id)}>
                  {org.name}
                </option>
              ))}
            </select>

            <div className="inline-flex gap-1 rounded-lg border bg-muted/40 p-1">
              {(["active", "paid", "all"] as PaymentFilter[]).map((f) => (
                <Button
                  key={f}
                  variant={paymentFilter === f ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-3 text-xs font-bold capitalize"
                  onClick={() => setPaymentFilter(f)}
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-2xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No organization orders match these filters.
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((order) => (
                <div
                  key={`${order.__orgId}-${order.id}`}
                  className="border rounded-2xl p-4 bg-muted/20 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-foreground">
                        #{order.order_number ?? String(order.id).slice(0, 8)}
                        <span className="ml-2 font-medium text-muted-foreground">
                          {order.__orgName}
                        </span>
                      </p>
                      {order.meta?.org_customer_name ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          For: {order.meta.org_customer_name}
                          {order.meta?.org_customer_phone ? ` • ${order.meta.org_customer_phone}` : ""}
                        </p>
                      ) : null}
                      {order.meta?.org_customer_notes ? (
                        <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                          {order.meta.org_customer_notes}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {clockTime(order.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm font-extrabold text-foreground">
                        {formatCurrency(order.total_amount)}
                      </span>
                      {isOrderUnpaid(order) ? (
                        <Badge variant="warning" className="text-[9px] uppercase">
                          Awaiting owner
                        </Badge>
                      ) : (
                        <Badge variant="success" className="text-[9px] uppercase">
                          Paid
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
