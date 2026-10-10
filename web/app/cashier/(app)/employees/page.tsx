"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  XCircle,
  MapPin,
  Clock,
} from "lucide-react";
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
import { formatETB } from "@/lib/format";
import { SearchInput } from "@/components/ui/input";
import { Segmented } from "@/components/segmented";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import StatsCard from "@/components/waiter/StatsCard";
import { useCashierAuth } from "@/components/cashier/auth-context";
import { cashierServices } from "@/lib/cashier/api";
import { AddItemsToOrderDialog } from "@/components/cashier/AddItemsToOrderDialog";

// Items can be added to an open order or a served ("done") one, which
// reopens it — mirrors the desktop/waiter portals' canAddItems.
const ADDABLE_STATUSES = new Set(["pending", "done"]);

const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "all", label: "All" },
] as const;
type Range = (typeof RANGES)[number]["key"];

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "transfer", label: "Transfer" },
  { value: "mobile", label: "Mobile" },
];

const formatCurrency = formatETB;

function normalizeStatus(s: any): string {
  return String(s || "").toLowerCase().replace(/[^a-z]/g, "").trim();
}

function initials(name: string): string {
  return (
    String(name || "")
      .split(/\s+/)
      .map((n) => n[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
}

function deptOf(it: any): string {
  return String(it?.main_category || "").trim().toLowerCase() || "other";
}

function itemSubtotal(it: any): number {
  const s = Number(it?.subtotal);
  if (Number.isFinite(s) && s > 0) return s;
  const qty = parseInt(it?.quantity, 10) || 0;
  const up = Number(it?.unit_price);
  if (Number.isFinite(up) && qty > 0) return up * qty;
  return 0;
}

function prettyDept(slug: string, labels: Record<string, string>): string {
  if (!slug) return "—";
  return (
    labels[slug] ||
    slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function itemsPreview(items: any[]): string {
  const arr = Array.isArray(items) ? items : [];
  const parts = arr
    .slice(0, 3)
    .map((it) => {
      const qty = parseInt(it?.quantity, 10);
      const name = it?.menu_item_name || it?.name || "";
      return name ? `${Number.isFinite(qty) ? qty : 1}x ${name}` : null;
    })
    .filter(Boolean);
  if (parts.length === 0) return "";
  const remaining = arr.length - 3;
  return remaining > 0 ? `${parts.join(", ")} +${remaining} more` : parts.join(", ");
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

function rangeBounds(range: Range): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (range === "today") {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
      to: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
    };
  }
  if (range === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return {
      from: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0),
      to: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999),
    };
  }
  if (range === "week") {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from, to: new Date(now) };
  }
  if (range === "month") {
    const from = new Date(now);
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
    return { from, to: new Date(now) };
  }
  return { from: null, to: null };
}

type Employee = {
  id: string;
  username?: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

export default function CashierEmployeesPage() {
  const { user } = useCashierAuth();
  const departments = user?.departments ?? [];
  // Mirror the desktop app: the cashier employees view is NOT department-scoped.
  // Every cashier settles whole orders (full total, all items) — never a
  // per-department share. Keeping `isAttached` pinned false routes all the
  // rendering/stats logic below through the whole-order path.
  const isAttached = false;

  // Per-role history lookback floor (YYYY-MM-DD). Empty = unlimited. The portal
  // uses a device token (no JWT role), so the window is enforced client-side.
  const lookbackDays = user?.history_lookback_days ?? null;
  const historyFloor = useMemo(() => {
    if (lookbackDays == null) return "";
    const d = new Date();
    d.setDate(d.getDate() - lookbackDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, [lookbackDays]);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [search, setSearch] = useState("");

  const [selectedId, setSelectedId] = useState<string>("");
  const [range, setRange] = useState<Range>("today");
  const [tableFilter, setTableFilter] = useState("");

  const [queueOrders, setQueueOrders] = useState<any[]>([]);
  const [employeeOrders, setEmployeeOrders] = useState<any[]>([]);
  const [deptLabels, setDeptLabels] = useState<Record<string, string>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  // Modal state.
  const [confirmTarget, setConfirmTarget] = useState<any>(null); // { kind, order, due? }
  const [confirmMethod, setConfirmMethod] = useState("cash");
  const [cancelOrder, setCancelOrder] = useState<any>(null);
  const [cancelPwdRequired, setCancelPwdRequired] = useState(false);
  const [cancelPwd, setCancelPwd] = useState("");
  const [verifyingCancel, setVerifyingCancel] = useState(false);
  const [addItemsTarget, setAddItemsTarget] = useState<any>(null);

  // This portal is cashier-only (gated by useCashierAuth), and a cashier's job
  // is managing the whole payment queue — which in practice means orders a
  // *waiter* created. So unlike the waiter portal's own add-items gate, this
  // doesn't check who created the order, only that it's still open (matches
  // the backend, which exempts the "cashier" role from its creator-only check
  // for exactly this reason).
  const canAddItems = useCallback(
    (order: any) =>
      ADDABLE_STATUSES.has(String(order?.status || "").toLowerCase()) &&
      // Backend rejects item additions once payment_status is "paid"
      // (order.service.ts assertCanModifyOrderItems) — gate the button here
      // too, or clicking it just queues an addition that fails forever.
      normalizeStatus(order?.payment_status) !== "paid",
    [],
  );

  // Settle-all (batch) state.
  const [settleAllOpen, setSettleAllOpen] = useState(false);
  const [settlingAll, setSettlingAll] = useState(false);
  const [settleProgress, setSettleProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  // Department-aware helpers (only narrow when the cashier is attached).
  const inDept = useCallback(
    (slug: string) => !isAttached || departments.includes(slug),
    [isAttached, departments],
  );
  const deptSubtotalOf = useCallback(
    (order: any) => {
      if (!isAttached) return Number(order?.total_amount) || 0;
      return (Array.isArray(order?.items) ? order.items : [])
        .filter((it: any) => inDept(deptOf(it)))
        .reduce((s: number, it: any) => s + itemSubtotal(it), 0);
    },
    [isAttached, inDept],
  );
  const orderTouchesDept = useCallback(
    (order: any) => {
      if (!isAttached) return true;
      return (Array.isArray(order?.items) ? order.items : []).some((it: any) =>
        inDept(deptOf(it)),
      );
    },
    [isAttached, inDept],
  );

  // Does this branch require a password to cancel an order?
  useEffect(() => {
    (async () => {
      try {
        const res: any = await cashierServices.settings.getCancelPasswordStatus();
        const payload = res?.data ?? res;
        setCancelPwdRequired(Boolean(payload?.data?.is_set ?? payload?.is_set));
      } catch {
        /* ignore — treat as not required */
      }
    })();
  }, []);

  // Department labels for nice headings.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res: any = await cashierServices.menu.getMainCategories();
        const payload = res?.data ?? res;
        const list =
          payload?.data?.mainCategories || payload?.mainCategories || payload?.data || [];
        const map: Record<string, string> = {};
        (Array.isArray(list) ? list : []).forEach((entry: any) => {
          const slug = String(entry?.slug || entry?.name || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
          if (slug) map[slug] = String(entry?.name || slug).replace(/_/g, " ").trim();
        });
        if (active) setDeptLabels(map);
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // ── Employees ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res: any = await cashierServices.users.getWaiters();
        const list = res?.data?.data?.users ?? res?.data?.users ?? [];
        const arr: Employee[] = (Array.isArray(list) ? list : []).map((u: any) => ({
          id: u.id,
          username: u.username,
          full_name: u.full_name || u.name || u.username || "Unknown",
          role: u.role || "cafe_waiter",
          is_active: u.is_active !== false,
        }));
        if (active) setEmployees(arr);
      } catch {
        if (active) toast.error("Failed to load employees");
      } finally {
        if (active) setLoadingEmployees(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const filteredEmployees = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return employees;
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(term) ||
        (e.username || "").toLowerCase().includes(term) ||
        e.role.toLowerCase().includes(term),
    );
  }, [employees, search]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedId) || null,
    [employees, selectedId],
  );

  // ── Per-employee data ──────────────────────────────────────────────────────
  const fetchEmployeeData = useCallback(
    async (employeeId: string, spinner = false) => {
      if (spinner) setLoadingDetail(true);
      try {
        const [queueRes, allRes] = await Promise.allSettled([
          // Active invoices, employee-scoped server-side. No departments passed:
          // the backend returns whole orders (all items, full totals), mirroring
          // the desktop app's un-scoped cashier view.
          cashierServices.orders.getCashierQueue([], employeeId),
          // Full history for stats + timeline (bounded to the cashier's window).
          cashierServices.orders.getAll({
            type: "cafe",
            employee_id: employeeId,
            ...(historyFloor ? { date_from: historyFloor } : {}),
          }),
        ]);

        const queueRaw =
          queueRes.status === "fulfilled"
            ? ((queueRes.value as any)?.data?.data?.orders ??
              (queueRes.value as any)?.data?.orders ??
              [])
            : [];
        setQueueOrders(Array.isArray(queueRaw) ? queueRaw : []);

        const allRaw =
          allRes.status === "fulfilled"
            ? ((allRes.value as any)?.data?.data?.orders ??
              (allRes.value as any)?.data?.orders ??
              [])
            : [];
        setEmployeeOrders(Array.isArray(allRaw) ? allRaw : []);
      } finally {
        if (spinner) setLoadingDetail(false);
      }
    },
    [historyFloor],
  );

  useEffect(() => {
    if (!selectedId) {
      setQueueOrders([]);
      setEmployeeOrders([]);
      return;
    }
    fetchEmployeeData(selectedId, true).catch(() =>
      toast.error("Failed to load employee data"),
    );
  }, [selectedId, fetchEmployeeData]);

  const refreshRef = useRef<() => void>(() => {});
  refreshRef.current = () => {
    if (selectedId) fetchEmployeeData(selectedId).catch(() => {});
  };
  useEffect(() => {
    if (!selectedId) return;
    const t = setInterval(() => refreshRef.current(), 6000);
    return () => clearInterval(t);
  }, [selectedId]);

  // ── Stats (department-scoped when attached) ────────────────────────────────
  const stats = useMemo(() => {
    const { from, to } = rangeBounds(range);
    const orders = (Array.isArray(employeeOrders) ? employeeOrders : []).filter(
      orderTouchesDept,
    );
    const rangeOrders =
      from && to
        ? orders.filter((o) => {
            const d = new Date(o.created_at);
            return !Number.isNaN(d.getTime()) && d >= from && d <= to;
          })
        : orders;

    const served = rangeOrders.filter((o) => {
      const st = normalizeStatus(o.status);
      const pst = normalizeStatus(o.payment_status);
      return ["completed", "paid", "done"].includes(st) || pst === "paid";
    });
    const revenue = served.reduce((s, o) => s + deptSubtotalOf(o), 0);
    const pending = rangeOrders
      .filter((o) => {
        const st = normalizeStatus(o.status);
        const pst = normalizeStatus(o.payment_status);
        const isCanceled = ["deleted", "cancelled", "canceled"].includes(st);
        const isPaid =
          pst === "paid" || st === "paid" || st === "completed" || st === "done";
        return !isCanceled && !isPaid;
      })
      .reduce((s, o) => s + deptSubtotalOf(o), 0);

    return { created: rangeOrders.length, served: served.length, revenue, pending, rangeOrders };
  }, [range, employeeOrders, orderTouchesDept, deptSubtotalOf]);

  const visibleQueue = useMemo(() => {
    const list = Array.isArray(queueOrders) ? queueOrders : [];
    return list
      .filter((o) =>
        tableFilter
          ? String(o?.table_number || "").toLowerCase().includes(tableFilter.toLowerCase())
          : true,
      )
      .slice()
      .sort(
        (a, b) =>
          new Date(b?.created_at || b?.updated_at).getTime() -
          new Date(a?.created_at || a?.updated_at).getTime(),
      );
  }, [queueOrders, tableFilter]);

  const itemsForDept = useCallback(
    (order: any, dept: string) =>
      (Array.isArray(order?.items) ? order.items : []).filter(
        (it: any) => deptOf(it) === dept,
      ),
    [],
  );

  // Every outstanding settlement for the visible queue: one task per unpaid
  // department due (attached cashier) or one per whole order (unattached).
  const pendingSettleTasks = useMemo(() => {
    const tasks: { kind: "department" | "whole"; order: any; due?: any }[] = [];
    for (const order of visibleQueue) {
      if (isAttached) {
        for (const due of order.department_dues ?? []) {
          if (!due.settled) tasks.push({ kind: "department", order, due });
        }
      } else {
        tasks.push({ kind: "whole", order });
      }
    }
    return tasks;
  }, [visibleQueue, isAttached]);

  const pendingSettleTotal = useMemo(
    () =>
      pendingSettleTasks.reduce(
        (s, t) =>
          s +
          (t.kind === "department"
            ? Number(t.due?.subtotal) || 0
            : Number(t.order?.total_amount) || 0),
        0,
      ),
    [pendingSettleTasks],
  );

  // ── Actions ────────────────────────────────────────────────────────────────
  const doSettleAll = useCallback(async () => {
    const tasks = pendingSettleTasks;
    if (tasks.length === 0 || settlingAll) return;
    setSettlingAll(true);
    setSettleProgress({ done: 0, total: tasks.length });
    let ok = 0;
    let fail = 0;
    // Sequential — avoids hammering the backend and racing the queue refresh.
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      try {
        if (t.kind === "department") {
          await cashierServices.payments.settleDepartment({
            order_id: t.order.id,
            department: t.due.department,
            payment_method: confirmMethod,
            processed_by: user?.id,
          });
        } else {
          const createRes: any = await cashierServices.payments.create({
            order_id: t.order.id,
            amount: t.order.total_amount,
            payment_method: confirmMethod,
            status: "paid",
            processed_by: user?.id,
          });
          const createdId =
            createRes?.data?.data?.payment?.id ?? createRes?.data?.payment?.id ?? null;
          if (createdId) {
            await cashierServices.payments.confirm(createdId, { processed_by: user?.id });
          }
        }
        ok += 1;
      } catch {
        fail += 1;
      } finally {
        setSettleProgress({ done: i + 1, total: tasks.length });
      }
    }
    setSettlingAll(false);
    setSettleAllOpen(false);
    setSettleProgress(null);
    if (fail === 0) toast.success(`Settled ${ok} payment${ok === 1 ? "" : "s"}`);
    else if (ok === 0) toast.error(`Failed to settle ${fail} payment${fail === 1 ? "" : "s"}`);
    else toast.warning(`Settled ${ok}, ${fail} failed`);
    if (selectedId) fetchEmployeeData(selectedId).catch(() => {});
  }, [
    pendingSettleTasks,
    settlingAll,
    confirmMethod,
    user?.id,
    selectedId,
    fetchEmployeeData,
  ]);

  const doConfirm = useCallback(async () => {
    if (!confirmTarget) return;
    const order = confirmTarget.order;
    const key =
      confirmTarget.kind === "department"
        ? `${order.id}:${confirmTarget.due.department}`
        : order.id;
    if (processing.has(key)) return;
    setProcessing((prev) => new Set(prev).add(key));
    setConfirmTarget(null);
    try {
      if (confirmTarget.kind === "department") {
        const due = confirmTarget.due;
        setQueueOrders((prev) =>
          prev
            .map((o) =>
              o.id === order.id
                ? {
                    ...o,
                    department_dues: (o.department_dues ?? []).filter(
                      (d: any) => d.department !== due.department,
                    ),
                  }
                : o,
            )
            .filter((o) => (o.department_dues ?? []).some((d: any) => !d.settled)),
        );
        await cashierServices.payments.settleDepartment({
          order_id: order.id,
          department: due.department,
          payment_method: confirmMethod,
          processed_by: user?.id,
        });
      } else {
        setQueueOrders((prev) => prev.filter((o) => o.id !== order.id));
        const createRes: any = await cashierServices.payments.create({
          order_id: order.id,
          amount: order.total_amount,
          payment_method: confirmMethod,
          status: "paid",
          processed_by: user?.id,
        });
        const createdId =
          createRes?.data?.data?.payment?.id ?? createRes?.data?.payment?.id ?? null;
        if (createdId) {
          await cashierServices.payments.confirm(createdId, { processed_by: user?.id });
        }
      }
      toast.success("Payment confirmed");
    } catch (err: any) {
      toast.error(err?.message || "Failed to confirm payment");
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      if (selectedId) fetchEmployeeData(selectedId).catch(() => {});
    }
  }, [confirmTarget, confirmMethod, processing, user?.id, selectedId, fetchEmployeeData]);

  const doCancel = useCallback(async () => {
    const order = cancelOrder;
    if (!order) return;
    if (processing.has(order.id) || verifyingCancel) return;

    if (cancelPwdRequired) {
      if (!cancelPwd.trim()) {
        toast.error("Enter the cancel password");
        return;
      }
      setVerifyingCancel(true);
      try {
        const res: any = await cashierServices.settings.verifyCancelPassword(
          cancelPwd.trim(),
        );
        const payload = res?.data ?? res;
        if (!Boolean(payload?.data?.valid ?? payload?.valid)) {
          toast.error("Incorrect cancel password");
          setVerifyingCancel(false);
          return;
        }
      } catch (err: any) {
        toast.error(err?.message || "Failed to verify password");
        setVerifyingCancel(false);
        return;
      }
      setVerifyingCancel(false);
    }

    setProcessing((prev) => new Set(prev).add(order.id));
    setCancelOrder(null);
    setCancelPwd("");
    setQueueOrders((prev) => prev.filter((o) => o.id !== order.id));
    try {
      await cashierServices.orders.updateStatus(order.id, { status: "cancelled" });
      await cashierServices.payments.create({
        order_id: order.id,
        amount: order.total_amount,
        payment_method: "cash",
        status: "cancelled",
        processed_by: user?.id,
      });
      toast.success("Order cancelled");
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel order");
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
      if (selectedId) fetchEmployeeData(selectedId).catch(() => {});
    }
  }, [
    cancelOrder,
    processing,
    verifyingCancel,
    cancelPwdRequired,
    cancelPwd,
    user?.id,
    selectedId,
    fetchEmployeeData,
  ]);

  const ItemLines = ({ items }: { items: any[] }) =>
    items.length > 0 ? (
      <div className="space-y-1 rounded-lg border bg-muted/30 p-2 text-xs">
        {items.map((it: any, idx: number) => (
          <div key={it.id || idx} className="flex justify-between gap-2 text-muted-foreground">
            <span className="truncate">
              {(parseInt(it.quantity, 10) || 1)}x {it.menu_item_name || it.name || "Item"}
            </span>
            <span className="font-semibold text-foreground">
              {formatCurrency(itemSubtotal(it))}
            </span>
          </div>
        ))}
      </div>
    ) : null;

  // ── Render: employee select ────────────────────────────────────────────────
  if (!selectedId) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
        <PageHeader
          title="Waiters"
          description={
            isAttached
              ? `Each waiter's ${departments.map((d) => prettyDept(d, deptLabels)).join(", ")} orders.`
              : "Pick a waiter to see their orders and payments."
          }
          action={
            <>
              <SearchInput
                placeholder="Find a waiter"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                wrapperClassName="w-full sm:w-64"
              />
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

            {loadingEmployees ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : filteredEmployees.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No waiter by that name.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredEmployees.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(e.id);
                      setTableFilter("");
                    }}
                    className="group flex min-h-14 items-center gap-3 rounded-card border border-border bg-card p-3 text-left transition-colors outline-none hover:border-primary/40 hover:bg-row-hover focus-visible:ring-4 focus-visible:ring-ring"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-highlight text-sm font-semibold text-highlight-foreground">
                      {initials(e.full_name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {e.full_name}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${e.is_active ? "bg-success" : "bg-muted-foreground"}`}
                        />
                        <span className="truncate text-xs capitalize text-muted-foreground">
                          {e.role.replace("_", " ")}
                        </span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render: employee detail ────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader
        eyebrow={<span className="capitalize">{(selectedEmployee?.role || "cafe waiter").replace("_", " ")}</span>}
        title={selectedEmployee?.full_name || selectedId}
        description={
          isAttached ? departments.map((d) => prettyDept(d, deptLabels)).join(" · ") : "Orders, payments and checkout."
        }
        action={
          <Button variant="outline" onClick={() => setSelectedId("")}>
            <ArrowLeft />
            All waiters
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Orders taken" value={stats.created} />
        <StatsCard title="Orders paid" value={stats.served} variant="success" />
        <StatsCard title={isAttached ? "Taken for your department" : "Taken"} value={formatCurrency(stats.revenue)} />
        <StatsCard title="Still to pay" value={formatCurrency(stats.pending)} variant="warning" />
      </div>

      <Segmented
        aria-label="Time range"
        value={range}
        onChange={(v) => setRange(v)}
        options={RANGES.map((r) => ({ value: r.key, label: r.label }))}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        {/* Active invoices */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-3 border-b">
            <CardTitle>Waiting for payment</CardTitle>
            <CardDescription>
              {isAttached ? "Your department's share." : "This waiter's served orders."}
            </CardDescription>
            <CardAction>
              <Badge variant="default">
                {visibleQueue.length} {visibleQueue.length === 1 ? "order" : "orders"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <SearchInput
                placeholder="Table filter…"
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)} wrapperClassName="w-full sm:max-w-[12rem]" />

            {pendingSettleTasks.length > 1 ? (
              <Button
                size="sm"
                className="w-full h-10 bg-success hover:bg-success/90 text-success-foreground"
                disabled={settlingAll}
                onClick={() => {
                  setConfirmMethod("cash");
                  setSettleAllOpen(true);
                }}
              >
                {settlingAll ? (
                  <RefreshCw className="animate-spin" />
                ) : (
                  <CheckCircle2 />
                )}
                Settle all {pendingSettleTasks.length} • {formatCurrency(pendingSettleTotal)}
              </Button>
            ) : null}

            {loadingDetail && visibleQueue.length === 0 ? (
              [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-card" />)
            ) : visibleQueue.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No active invoices waiting for payment
              </div>
            ) : (
              visibleQueue.map((order) => {
                const dues = order.department_dues ?? [];
                return (
                  <div key={order.id} className="border rounded-card p-4 bg-muted/20 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground">
                          #{order.order_number ?? "—"}
                          {order.table_number ? (
                            <span className="ml-2 font-medium text-muted-foreground">
                              Table {order.table_number}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatCurrency(order.total_amount)} total
                        </p>
                      </div>
                    </div>

                    {canAddItems(order) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-8"
                        onClick={() => setAddItemsTarget(order)}
                      >
                        Add items
                      </Button>
                    )}

                    {isAttached ? (
                      <>
                      {dues.length === 0 ? (
                        <p className="py-2 text-center text-xs text-muted-foreground">
                          Nothing to settle for your department.
                        </p>
                      ) : (
                        dues.map((due: any) => {
                          const key = `${order.id}:${due.department}`;
                          const busy = processing.has(key);
                          return (
                            <div key={due.department} className="rounded-xl border bg-background p-3 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-foreground">
                                  {prettyDept(due.department, deptLabels)}
                                </span>
                                {due.settled ? (
                                  <Badge variant="success">Paid</Badge>
                                ) : (
                                  <span className="text-sm font-semibold text-foreground">
                                    {formatCurrency(due.subtotal)}
                                  </span>
                                )}
                              </div>
                              <ItemLines items={itemsForDept(order, due.department)} />
                              {!due.settled ? (
                                <Button
                                  size="sm"
                                  className="w-full h-9 bg-success hover:bg-success/90 text-success-foreground"
                                  disabled={busy}
                                  onClick={() => {
                                    setConfirmMethod("cash");
                                    setConfirmTarget({ kind: "department", order, due });
                                  }}
                                >
                                  {busy ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                                  Settle {prettyDept(due.department, deptLabels)}
                                </Button>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-9 border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                        disabled={processing.has(order.id)}
                        onClick={() => setCancelOrder(order)}
                      >
                        <XCircle />
                        Cancel order
                      </Button>
                      </>
                    ) : (
                      <>
                        <ItemLines items={order.items ?? []} />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="flex-1 h-9 bg-success hover:bg-success/90 text-success-foreground"
                            disabled={processing.has(order.id)}
                            onClick={() => {
                              setConfirmMethod("cash");
                              setConfirmTarget({ kind: "whole", order });
                            }}
                          >
                            {processing.has(order.id) ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                            Settle
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9"
                            disabled={processing.has(order.id)}
                            onClick={() => setCancelOrder(order)}
                          >
                            <XCircle />
                            Cancel
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-3 border-b">
            <CardTitle>Order timeline</CardTitle>
            <CardDescription>
              {isAttached ? "Department activity in range" : "Recent activity in range"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5 space-y-3">
            {stats.rangeOrders.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No orders in this range
              </div>
            ) : (
              stats.rangeOrders
                .slice()
                .sort(
                  (a: any, b: any) =>
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                )
                .slice(0, 12)
                .map((o: any) => {
                  const st = normalizeStatus(o.status);
                  const pst = normalizeStatus(o.payment_status);
                  const isCanceled = ["deleted", "cancelled", "canceled"].includes(st);
                  const isPaid =
                    pst === "paid" || st === "paid" || st === "completed" || st === "done";
                  const label = isCanceled ? "cancelled" : isPaid ? "paid" : st || o.status || "pending";
                  const deptItems = isAttached
                    ? (Array.isArray(o.items) ? o.items : []).filter((it: any) => inDept(deptOf(it)))
                    : o.items;
                  return (
                    <div
                      key={o.id}
                      className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${isCanceled ? "opacity-60 bg-destructive/5" : "bg-muted/10"}`}
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <MapPin className="h-3 w-3 text-primary" />
                          {o.table_number ? `Table ${o.table_number}` : "Take Away"}
                          <span className="font-medium text-muted-foreground">#{o.order_number ?? "—"}</span>
                        </p>
                        {itemsPreview(deptItems) ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {itemsPreview(deptItems)}
                          </p>
                        ) : null}
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {clockTime(o.created_at)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-xs font-semibold text-foreground">
                          {formatCurrency(deptSubtotalOf(o))}
                        </span>
                        <Badge
                          variant={label === "paid" ? "success" : label === "cancelled" ? "destructive" : "warning"}
                         
                        >
                          {label}
                        </Badge>
                      </div>
                    </div>
                  );
                })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Settle modal */}
      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm payment</DialogTitle>
            <DialogDescription>
              {confirmTarget
                ? confirmTarget.kind === "department"
                  ? `Settle ${prettyDept(confirmTarget.due.department, deptLabels)} for order #${confirmTarget.order.order_number ?? ""}.`
                  : `Settle order #${confirmTarget.order.order_number ?? ""}${confirmTarget.order.table_number ? ` (Table ${confirmTarget.order.table_number})` : ""}.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {confirmTarget ? (
            <div className="space-y-4 py-1">
              <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
                <span className="text-sm font-semibold text-muted-foreground">Amount due</span>
                <span className="text-xl font-semibold text-foreground">
                  {formatCurrency(
                    confirmTarget.kind === "department"
                      ? confirmTarget.due.subtotal
                      : confirmTarget.order.total_amount,
                  )}
                </span>
              </div>
              <div className="space-y-1.5">
                <Label>Payment method</Label>
                <select
                  value={confirmMethod}
                  onChange={(e) => setConfirmMethod(e.target.value)}
                  className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 w-full"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button onClick={doConfirm}>
              <CheckCircle2 />
              Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settle-all modal */}
      <Dialog
        open={settleAllOpen}
        onOpenChange={(o) => {
          if (!o && !settlingAll) setSettleAllOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settle all pending payments</DialogTitle>
            <DialogDescription>
              Confirm {pendingSettleTasks.length} pending payment
              {pendingSettleTasks.length === 1 ? "" : "s"} for{" "}
              {selectedEmployee?.full_name || "this waiter"}
              {isAttached ? " (your department's share)" : ""}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
              <span className="text-sm font-semibold text-muted-foreground">Total amount</span>
              <span className="text-xl font-semibold text-foreground">
                {formatCurrency(pendingSettleTotal)}
              </span>
            </div>
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <select
                value={confirmMethod}
                onChange={(e) => setConfirmMethod(e.target.value)}
                disabled={settlingAll}
                className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 w-full"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Applied to every payment in this batch.
              </p>
            </div>
            {settleProgress ? (
              <p className="text-center text-xs font-semibold text-muted-foreground">
                Settling {settleProgress.done} / {settleProgress.total}…
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSettleAllOpen(false)}
              disabled={settlingAll}
            >
              Cancel
            </Button>
            <Button
              className="bg-success hover:bg-success/90 text-success-foreground"
              onClick={doSettleAll}
              disabled={settlingAll || pendingSettleTasks.length === 0}
            >
              {settlingAll ? (
                <RefreshCw className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              {settlingAll ? "Settling…" : `Confirm ${pendingSettleTasks.length} payments`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel modal */}
      <Dialog
        open={!!cancelOrder}
        onOpenChange={(o) => {
          if (!o) {
            setCancelOrder(null);
            setCancelPwd("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel order</DialogTitle>
            <DialogDescription>
              Cancel order #{cancelOrder?.order_number ?? ""}
              {cancelOrder?.table_number ? ` (Table ${cancelOrder.table_number})` : ""}? This
              voids the order and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {cancelPwdRequired ? (
            <div className="space-y-1.5 py-1">
              <Label htmlFor="emp-cancel-pwd">Cancel password</Label>
              <Input
                id="emp-cancel-pwd"
                type="password"
                value={cancelPwd}
                onChange={(e) => setCancelPwd(e.target.value)}
                placeholder="Enter cancel password"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") doCancel();
                }}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelOrder(null);
                setCancelPwd("");
              }}
            >
              Keep order
            </Button>
            <Button variant="destructive" onClick={doCancel} disabled={verifyingCancel}>
              <XCircle />
              {verifyingCancel ? "Verifying…" : "Cancel order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddItemsToOrderDialog
        order={addItemsTarget}
        open={!!addItemsTarget}
        onOpenChange={(open) => !open && setAddItemsTarget(null)}
        currentUserId={user?.id}
        formatCurrency={formatCurrency}
        onSaved={() => {
          if (selectedId) fetchEmployeeData(selectedId).catch(() => {});
        }}
      />
    </div>
  );
}
