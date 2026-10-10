"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/segmented";
import { PageHeader } from "@/components/page-header";
import { formatETB } from "@/lib/format";
import { SearchInput } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cashierServices } from "@/lib/cashier/api";
import { formatOrderNumber } from "@/lib/utils";

type PaymentFilter = "active" | "paid" | "all";

const formatCurrency = formatETB;

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
      toast.error("Couldn't load company orders. Please try again.");
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
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Company account orders"
        description={`${activeCount} open · the company pays later, not in cash now. Only the owner can mark one as paid.`}
        action={
          <>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : undefined} />
              Refresh
            </Button>
            <Button variant="outline" asChild>
              <Link href="/cashier">
                <ArrowLeft />
                Till
              </Link>
            </Button>
          </>
        }
      />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              placeholder="Order number, company or customer"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              wrapperClassName="w-full sm:max-w-xs"
            />

            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              className="h-10 rounded-full border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value="all">All companies</option>
              {organizations.map((org) => (
                <option key={org.id} value={String(org.id)}>
                  {org.name}
                </option>
              ))}
            </select>

            <Segmented
              aria-label="Payment status"
              value={paymentFilter}
              onChange={(f) => setPaymentFilter(f)}
              options={(["active", "paid", "all"] as PaymentFilter[]).map((f) => ({
                value: f,
                label: f.charAt(0).toUpperCase() + f.slice(1),
              }))}
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-card" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No company orders match. Try other filters.</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((order) => (
                <div
                  key={`${order.__orgId}-${order.id}`}
                  className="border rounded-card p-4 bg-muted/20 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">
                        {formatOrderNumber(order)}
                        <span className="ml-2 font-medium text-muted-foreground">
                          {order.__orgName}
                        </span>
                      </p>
                      {order.meta?.org_customer_name ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          For: {order.meta.org_customer_name}
                          {order.meta?.org_customer_phone ? ` • ${order.meta.org_customer_phone}` : ""}
                        </p>
                      ) : null}
                      {order.meta?.org_customer_notes ? (
                        <p className="mt-0.5 text-xs italic text-muted-foreground">
                          {order.meta.org_customer_notes}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {clockTime(order.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm font-semibold text-foreground">
                        {formatCurrency(order.total_amount)}
                      </span>
                      {isOrderUnpaid(order) ? (
                        <Badge variant="warning">
                          Waiting for owner
                        </Badge>
                      ) : (
                        <Badge variant="success">
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
