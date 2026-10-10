"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  LogOut,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  UserCog,
  Users,
  X,
  Building2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatETB, humanize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { useCashierAuth } from "@/components/cashier/auth-context";
import { cashierServices } from "@/lib/cashier/api";
import { AddItemsToOrderDialog } from "@/components/cashier/AddItemsToOrderDialog";

const POLL_MS = 7000;

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "transfer", label: "Transfer" },
  { value: "mobile", label: "Mobile" },
];

const formatCurrency = formatETB;

function prettyDept(slug: string, labels: Record<string, string>): string {
  if (!slug) return "—";
  return (
    labels[slug] ||
    slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function timeAgo(iso: any): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function clockTime(iso: any): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function itemSubtotal(it: any): number {
  const s = Number(it?.subtotal);
  if (Number.isFinite(s) && s > 0) return s;
  const qty = parseInt(it?.quantity, 10) || 0;
  const up = Number(it?.unit_price);
  if (Number.isFinite(up) && qty > 0) return up * qty;
  return 0;
}

function ymd(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Due = { department: string; subtotal: number; settled: boolean };
type Item = {
  id?: string;
  menu_item_id?: string;
  menu_item_name?: string;
  name?: string;
  quantity?: number;
  subtotal?: number;
  main_category?: string;
};
type QueueOrder = {
  id: string;
  order_number?: number;
  table_number?: number | null;
  total_amount?: number;
  created_at?: string;
  updated_at?: string;
  employee_name?: string;
  items?: Item[];
  department_dues?: Due[];
  status?: string;
  payment_status?: string;
  created_by_id?: string;
  waiter_id?: string;
  employee_id?: string;
};

// Items can be added to an open order or a served ("done") one, which
// reopens it — mirrors the desktop/waiter portals' canAddItems.
const ADDABLE_STATUSES = new Set(["pending", "done"]);

// Receipt-style item lines: "qty × name" with the amount on the right.
const ItemLines = ({ items }: { items: Item[] }) =>
  items.length > 0 ? (
    <ul className="space-y-0.5 text-sm">
      {items.map((it, i) => (
        <li key={it.id || i} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-body">
            <span className="text-muted-foreground">{parseInt(String(it.quantity), 10) || 1} ×</span>{" "}
            {it.menu_item_name || it.name || "Item"}
          </span>
          <span className="shrink-0 text-muted-foreground">{formatCurrency(itemSubtotal(it))}</span>
        </li>
      ))}
    </ul>
  ) : null;

type ConfirmTarget =
  | { kind: "department"; order: QueueOrder; due: Due }
  | { kind: "whole"; order: QueueOrder };

export default function CashierQueuePage() {
  const router = useRouter();
  const { user, logout } = useCashierAuth();

  const departments = user?.departments ?? [];
  const isAttached = departments.length > 0;
  const departmentsKey = useMemo(() => departments.join(","), [departments]);

  // Per-role history lookback (days back; null/absent = unlimited). A 0-day
  // cashier only ever sees today, so the "yesterday" tab is hidden for them.
  const lookbackDays = user?.history_lookback_days ?? null;
  const allowYesterday = lookbackDays == null || lookbackDays >= 1;
  const rangeOptions = (
    allowYesterday ? (["today", "yesterday"] as const) : (["today"] as const)
  );

  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deptLabels, setDeptLabels] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  const [range, setRange] = useState<"today" | "yesterday">("today");
  const [payments, setPayments] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [confirmMethod, setConfirmMethod] = useState("cash");
  // On wide screens the charge panel is docked beside the queue; below that it opens as a dialog.
  const isWide = useMediaQuery("(min-width: 1024px)");
  // True from the instant a confirm is submitted until it settles — blocks a
  // second click from firing a duplicate payment within the same render tick.
  const submittingRef = useRef(false);
  const [cancelTarget, setCancelTarget] = useState<QueueOrder | null>(null);
  const [cancelPwdRequired, setCancelPwdRequired] = useState(false);
  const [cancelPwd, setCancelPwd] = useState("");
  const [verifyingCancel, setVerifyingCancel] = useState(false);
  const [addItemsTarget, setAddItemsTarget] = useState<QueueOrder | null>(null);

  // ── Table selector ─────────────────────────────────────────────────────────
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [settleTableOpen, setSettleTableOpen] = useState(false);
  const [settlingTable, setSettlingTable] = useState(false);
  const [settleProgress, setSettleProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  // This portal is cashier-only (gated by useCashierAuth), and a cashier's
  // job is managing the whole payment queue — which in practice means orders
  // a *waiter* created. So unlike the waiter portal's own add-items gate,
  // this doesn't check who created the order, only that it's still open
  // (matches the backend, which exempts the "cashier" role from its
  // creator-only check for exactly this reason).
  const canAddItems = useCallback(
    (order: QueueOrder) =>
      ADDABLE_STATUSES.has(String(order.status || "").toLowerCase()) &&
      // Backend rejects item additions once payment_status is "paid"
      // (order.service.ts assertCanModifyOrderItems) — gate the button here
      // too, or clicking it just queues an addition that fails forever.
      String(order.payment_status || "").toLowerCase() !== "paid",
    [],
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

  // ── Department labels ──────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res: any = await cashierServices.menu.getMainCategories();
        const payload = res?.data ?? res;
        const list =
          payload?.data?.mainCategories ||
          payload?.mainCategories ||
          payload?.data ||
          [];
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

  // ── Queue ──────────────────────────────────────────────────────────────────
  const loadQueue = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setRefreshing(true);
      try {
        const res: any = await cashierServices.orders.getCashierQueue(
          departmentsKey ? departmentsKey.split(",") : [],
        );
        const payload = res?.data ?? res;
        const list = payload?.data?.orders ?? payload?.orders ?? [];
        setOrders(Array.isArray(list) ? list : []);
      } catch (err: any) {
        if (showSpinner) toast.error(err?.message || "Failed to load orders");
      } finally {
        setLoading(false);
        if (showSpinner) setRefreshing(false);
      }
    },
    [departmentsKey],
  );

  const loadRef = useRef(loadQueue);
  loadRef.current = loadQueue;
  useEffect(() => {
    loadRef.current(false);
    const t = setInterval(() => loadRef.current(false), POLL_MS);
    return () => clearInterval(t);
  }, [departmentsKey]);

  // ── Recent payments (date-windowed ledger) ─────────────────────────────────
  const loadPayments = useCallback(async () => {
    // Guard against a stale "yesterday" range for a today-only cashier.
    const effectiveRange = range === "yesterday" && !allowYesterday ? "today" : range;
    const day = effectiveRange === "today" ? ymd(0) : ymd(1);
    try {
      const res: any = await cashierServices.payments.history({
        date_from: day,
        date_to: day,
        limit: 100,
      });
      console.log("loadPayments", res);
      const payload = res?.data ?? res;
      const list = payload?.data?.payments ?? payload?.payments ?? [];
      const filtered = (Array.isArray(list) ? list : []).filter((p: any) => {
        if (!isAttached) return true;
        const dept = String(p?.meta?.department || "").trim().toLowerCase();
        return p?.meta?.scope === "department" && departments.includes(dept);
      });
      console.log("filtered payments", filtered);
      setPayments(filtered);
    } catch {
      setPayments([]);
    }
  }, [range, isAttached, departments, allowYesterday]);

  const paymentsRef = useRef(loadPayments);
  paymentsRef.current = loadPayments;
  useEffect(() => {
    paymentsRef.current();
    const t = setInterval(() => paymentsRef.current(), POLL_MS * 2);
    return () => clearInterval(t);
  }, [range, departmentsKey]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const paid = payments.filter(
      (p) => String(p?.status || "").toLowerCase() === "paid",
    );
    const revenue = paid.reduce((s, p) => s + (Number(p?.amount) || 0), 0);
    let pending = 0;
    for (const o of orders) {
      if (isAttached) {
        for (const d of o.department_dues ?? []) {
          if (!d.settled) pending += Number(d.subtotal) || 0;
        }
      } else {
        pending += Number(o.total_amount) || 0;
      }
    }
    return { count: paid.length, revenue, pending };
  }, [payments, orders, isAttached]);

  const refreshAll = useCallback(() => {
    loadQueue(true);
    loadPayments();
  }, [loadQueue, loadPayments]);

  // ── Table selector ─────────────────────────────────────────────────────────
  // Distinct table numbers present in the live queue, each with its order count.
  const tableSummaries = useMemo(() => {
    const map = new Map<number, { count: number; total: number }>();
    for (const o of orders) {
      if (o.table_number == null) continue;
      const entry = map.get(o.table_number) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += Number(o.total_amount) || 0;
      map.set(o.table_number, entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([table_number, v]) => ({ table_number, ...v }));
  }, [orders]);

  // Drop the filter automatically once its table has no orders left (e.g. all
  // settled), so the aggregate card doesn't linger empty.
  useEffect(() => {
    if (selectedTable != null && !orders.some((o) => o.table_number === selectedTable)) {
      setSelectedTable(null);
    }
  }, [orders, selectedTable]);

  const filteredOrders = useMemo(
    () => (selectedTable == null ? orders : orders.filter((o) => o.table_number === selectedTable)),
    [orders, selectedTable],
  );

  // Every outstanding settlement for the selected table: one task per unpaid
  // department due (attached cashier) or one per whole order (unattached).
  const tableSettleTasks = useMemo(() => {
    if (selectedTable == null) return [];
    const tasks: { kind: "department" | "whole"; order: QueueOrder; due?: Due }[] = [];
    for (const order of filteredOrders) {
      if (isAttached) {
        for (const due of order.department_dues ?? []) {
          if (!due.settled) tasks.push({ kind: "department", order, due });
        }
      } else {
        tasks.push({ kind: "whole", order });
      }
    }
    return tasks;
  }, [filteredOrders, isAttached, selectedTable]);

  const tableSettleTotal = useMemo(
    () =>
      tableSettleTasks.reduce(
        (s, t) =>
          s + (t.kind === "department" ? Number(t.due?.subtotal) || 0 : Number(t.order?.total_amount) || 0),
        0,
      ),
    [tableSettleTasks],
  );

  const doSettleTable = useCallback(async () => {
    const tasks = tableSettleTasks;
    const table = selectedTable;
    if (tasks.length === 0 || settlingTable) return;
    setSettlingTable(true);
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
            department: t.due!.department,
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
    setSettlingTable(false);
    setSettleTableOpen(false);
    setSettleProgress(null);
    if (fail === 0) toast.success(`Settled ${ok} payment${ok === 1 ? "" : "s"} for Table ${table}`);
    else if (ok === 0) toast.error(`Failed to settle ${fail} payment${fail === 1 ? "" : "s"}`);
    else toast.warning(`Settled ${ok}, ${fail} failed`);
    loadQueue(false);
    loadPayments();
  }, [tableSettleTasks, settlingTable, confirmMethod, user?.id, selectedTable, loadQueue, loadPayments]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const openConfirm = useCallback((target: ConfirmTarget) => {
    setConfirmMethod("cash");
    setConfirmTarget(target);
  }, []);

  const doConfirm = useCallback(async () => {
    if (!confirmTarget) return;
    // Synchronous re-entrancy guard. `processing` is React state, so two clicks
    // fired in the same tick both read it as empty and would each submit a
    // payment (a real source of duplicate rows). A ref flips immediately, so the
    // second click is dropped before any request goes out.
    if (submittingRef.current) return;
    submittingRef.current = true;
    const order = confirmTarget.order;
    const key =
      confirmTarget.kind === "department"
        ? `${order.id}:${confirmTarget.due.department}`
        : order.id;
    if (processing.has(key)) {
      submittingRef.current = false;
      return;
    }
    setProcessing((prev) => new Set(prev).add(key));
    setConfirmTarget(null);
    try {
      if (confirmTarget.kind === "department") {
        const due = confirmTarget.due;
        setOrders((prev) =>
          prev
            .map((o) =>
              o.id === order.id
                ? {
                    ...o,
                    department_dues: (o.department_dues ?? []).filter(
                      (d) => d.department !== due.department,
                    ),
                  }
                : o,
            )
            .filter((o) => (o.department_dues ?? []).some((d) => !d.settled)),
        );
        await cashierServices.payments.settleDepartment({
          order_id: order.id,
          department: due.department,
          payment_method: confirmMethod,
          processed_by: user?.id,
        });
        toast.success(
          `${prettyDept(due.department, deptLabels)} settled — ${formatCurrency(due.subtotal)}`,
        );
      } else {
        setOrders((prev) => prev.filter((o) => o.id !== order.id));
        const createRes: any = await cashierServices.payments.create({
          order_id: order.id,
          amount: order.total_amount,
          payment_method: confirmMethod,
          status: "paid",
          processed_by: user?.id,
        });
        const createdId =
          createRes?.data?.data?.payment?.id ??
          createRes?.data?.payment?.id ??
          null;
        if (createdId) {
          await cashierServices.payments.confirm(createdId, {
            processed_by: user?.id,
          });
        }
        toast.success(
          `Order #${order.order_number ?? ""} settled — ${formatCurrency(order.total_amount)}`,
        );
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to confirm payment");
    } finally {
      submittingRef.current = false;
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      loadQueue(false);
      loadPayments();
    }
  }, [confirmTarget, confirmMethod, processing, user?.id, deptLabels, loadQueue, loadPayments]);

  const doCancel = useCallback(async () => {
    const order = cancelTarget;
    if (!order) return;
    const key = `cancel:${order.id}`;
    if (processing.has(key) || verifyingCancel) return;

    // Gate on the branch cancel password when one is configured.
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

    setProcessing((prev) => new Set(prev).add(key));
    setCancelTarget(null);
    setCancelPwd("");
    setOrders((prev) => prev.filter((o) => o.id !== order.id));
    try {
      await cashierServices.orders.updateStatus(order.id, { status: "cancelled" });
      await cashierServices.payments.create({
        order_id: order.id,
        amount: order.total_amount,
        payment_method: "cash",
        status: "cancelled",
        processed_by: user?.id,
      });
      toast.success(`Order #${order.order_number ?? ""} cancelled`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel order");
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      loadQueue(false);
    }
  }, [cancelTarget, processing, verifyingCancel, cancelPwdRequired, cancelPwd, user?.id, loadQueue]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onLogout = useCallback(() => {
    logout();
    router.replace("/cashier/login");
  }, [logout, router]);

  const itemsForDept = useCallback(
    (order: QueueOrder, dept: string) =>
      (order.items ?? []).filter(
        (it) =>
          (String(it?.main_category || "").trim().toLowerCase() || "other") === dept,
      ),
    [],
  );


  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const confirmKey = confirmTarget
    ? confirmTarget.kind === "department"
      ? `${confirmTarget.order.id}:${confirmTarget.due.department}`
      : confirmTarget.order.id
    : null;
  const confirmTitle = confirmTarget
    ? `#${confirmTarget.order.order_number ?? ""}${confirmTarget.order.table_number != null ? ` · Table ${confirmTarget.order.table_number}` : ""}`
    : "";
  const confirmHint =
    confirmTarget?.kind === "department"
      ? `${prettyDept(confirmTarget.due.department, deptLabels)} only. Pick how the guest paid.`
      : "Pick how the guest paid, then charge.";
  // Receipt-style body shared by the docked panel and the dialog.
  const chargeBody = confirmTarget ? (
    <div className="space-y-5">
      <ItemLines
        items={
          confirmTarget.kind === "department"
            ? itemsForDept(confirmTarget.order, confirmTarget.due.department)
            : confirmTarget.order.items ?? []
        }
      />
      <div className="flex items-baseline justify-between border-t border-dashed border-border pt-4">
        <span className="text-base font-semibold text-foreground">Total</span>
        <span className="text-kpi text-foreground">
          {formatCurrency(
            confirmTarget.kind === "department" ? confirmTarget.due.subtotal : confirmTarget.order.total_amount,
          )}
        </span>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Paid with</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Payment method">
          {PAYMENT_METHODS.map((m) => (
            <Button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={confirmMethod === m.value}
              variant={confirmMethod === m.value ? "selected" : "outline"}
              onClick={() => setConfirmMethod(m.value)}>
              {m.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {/* Header row: who is on the till, where to go */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-1">{user?.full_name || user?.username || "Cashier"}</p>
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-foreground sm:text-title">Till</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {today} · {orders.length} waiting for payment
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {isAttached ? (
              departments.map((d) => (
                <Badge key={d} variant="default">
                  {prettyDept(d, deptLabels)}
                </Badge>
              ))
            ) : (
              <Badge variant="muted">All departments</Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={refreshAll} disabled={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin" : undefined} />
            Refresh
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/cashier/employees">
              <Users />
              Waiters
            </Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/cashier/organizations">
              <Building2 />
              Organizations
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label="Profile">
            <Link href="/cashier/profile">
              <UserCog />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Sign out" title="Sign out">
            <LogOut />
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <section className="space-y-3">
        <div
          role="tablist"
          aria-label="Day"
          className="inline-flex h-10 items-center gap-0.5 rounded-full border border-border bg-card p-1">
          {rangeOptions.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={
                range === r
                  ? "h-8 rounded-full bg-highlight px-4 text-sm font-semibold text-highlight-foreground"
                  : "h-8 rounded-full px-4 text-sm font-semibold text-muted-foreground hover:text-foreground"
              }>
              {r === "today" ? "Today" : "Yesterday"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatsCard title="Payments taken" value={stats.count} />
          <StatsCard title="Revenue" value={formatCurrency(stats.revenue)} variant="success" />
          <StatsCard title="Waiting to be paid" value={formatCurrency(stats.pending)} />
        </div>
      </section>

      {/* Live orders (60%), current order and recent payments (40%) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <Card className="gap-0 overflow-hidden py-0">
          <div className="space-y-3 border-b border-border px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-section text-foreground">Waiting for payment</h2>
                <p className="text-meta text-muted-foreground">Orders sent by waiters, newest first.</p>
              </div>
              <span className="shrink-0 rounded-full bg-highlight px-2.5 py-0.5 text-eyebrow text-highlight-foreground">
                {orders.length} {orders.length === 1 ? "order" : "orders"}
              </span>
            </div>
            {tableSummaries.length > 0 ? (
              <select
                value={selectedTable == null ? "" : String(selectedTable)}
                onChange={(e) => setSelectedTable(e.target.value ? Number(e.target.value) : null)}
                aria-label="Filter by table"
                className="h-10 rounded-full border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 w-full sm:w-56">
                <option value="">All tables</option>
                {tableSummaries.map((t) => (
                  <option key={t.table_number} value={t.table_number}>
                    Table {t.table_number} ({t.count} {t.count === 1 ? "order" : "orders"})
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {selectedTable != null ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-highlight/30 px-5 py-4">
              <div>
                <p className="font-semibold text-foreground">Table {selectedTable}</p>
                <p className="text-meta text-muted-foreground">
                  {filteredOrders.length} {filteredOrders.length === 1 ? "order" : "orders"} ·{" "}
                  {formatCurrency(tableSettleTotal)} due{isAttached ? " for your department" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon-sm" onClick={() => setSelectedTable(null)} aria-label="Clear table filter">
                  <X />
                </Button>
                <Button
                  disabled={tableSettleTasks.length === 0 || settlingTable}
                  onClick={() => {
                    setConfirmMethod("cash");
                    setSettleTableOpen(true);
                  }}>
                  Charge all for Table {selectedTable}
                </Button>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="space-y-3 p-5">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              {selectedTable != null
                ? `Nothing waiting on Table ${selectedTable}.`
                : "Nothing waiting. New orders show up here."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filteredOrders.map((order) => {
                const dues = order.department_dues ?? [];
                return (
                  <li
                    key={order.id}
                    className={cn(
                      "space-y-3 px-5 py-4 transition-colors hover:bg-row-hover",
                      confirmTarget?.order.id === order.id && "bg-highlight/40 hover:bg-highlight/40",
                    )}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">
                          #{order.order_number ?? "—"}
                          {order.table_number != null ? ` · Table ${order.table_number}` : ""}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-meta text-muted-foreground">
                          {order.employee_name || "Waiter"}
                          <span aria-hidden>·</span>
                          <Clock className="size-3" />
                          {timeAgo(order.created_at)}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold text-foreground">{formatCurrency(order.total_amount)}</span>
                    </div>

                    {isAttached ? (
                      <>
                        {dues.length === 0 ? (
                          <p className="text-meta text-muted-foreground">Nothing to settle for your department.</p>
                        ) : (
                          dues.map((due) => {
                            const key = `${order.id}:${due.department}`;
                            const busy = processing.has(key);
                            return (
                              <div key={due.department} className="space-y-2 border-l-2 border-border pl-3">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium text-foreground">
                                    {prettyDept(due.department, deptLabels)}
                                  </span>
                                  {due.settled ? (
                                    <StatusBadge kind="payment" status="paid" />
                                  ) : (
                                    <span className="text-sm font-semibold text-foreground">{formatCurrency(due.subtotal)}</span>
                                  )}
                                </div>
                                <ItemLines items={itemsForDept(order, due.department)} />
                                {!due.settled ? (
                                  <Button
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => openConfirm({ kind: "department", order, due })}>
                                    {busy ? "Charging…" : "Charge"}
                                  </Button>
                                ) : null}
                              </div>
                            );
                          })
                        )}
                        <div className="flex flex-wrap gap-2">
                          {canAddItems(order) && (
                            <Button size="sm" variant="ghost" onClick={() => setAddItemsTarget(order)}>
                              Add items
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                            disabled={processing.has(`cancel:${order.id}`)}
                            onClick={() => setCancelTarget(order)}>
                            Cancel order
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <ItemLines items={order.items ?? []} />
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                            disabled={processing.has(`cancel:${order.id}`)}
                            onClick={() => setCancelTarget(order)}>
                            Cancel
                          </Button>
                          {canAddItems(order) && (
                            <Button size="sm" variant="ghost" onClick={() => setAddItemsTarget(order)}>
                              Add items
                            </Button>
                          )}
                          <Button
                            size="sm"
                            disabled={processing.has(order.id)}
                            onClick={() => openConfirm({ kind: "whole", order })}>
                            {processing.has(order.id) ? "Charging…" : "Charge"}
                          </Button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-6 lg:sticky lg:top-6">
        {/* Current order: docked on wide screens */}
        <Card className="hidden gap-0 overflow-hidden py-0 lg:block">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <p className="eyebrow">Current order</p>
              <h2 className="truncate text-section text-foreground">{confirmTarget ? confirmTitle : "No order picked"}</h2>
              {confirmTarget ? <p className="text-meta text-muted-foreground">{confirmHint}</p> : null}
            </div>
            {confirmTarget ? (
              <Button variant="ghost" size="icon-sm" onClick={() => setConfirmTarget(null)} aria-label="Close current order">
                <X />
              </Button>
            ) : null}
          </div>
          {confirmTarget ? (
            <div className="space-y-5 px-5 py-4">
              {chargeBody}
              <Button
                size="charge"
                className="w-full"
                onClick={doConfirm}
                disabled={!confirmKey || processing.has(confirmKey)}>
                {confirmKey && processing.has(confirmKey) ? "Charging…" : "Charge"}
              </Button>
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Tap Charge on an order to settle it here.
            </p>
          )}
        </Card>

        {/* Recent payments */}
        <Card className="gap-0 overflow-hidden py-0">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-section text-foreground">Recent payments</h2>
            <p className="text-meta text-muted-foreground">Taken {range === "today" ? "today" : "yesterday"}.</p>
          </div>
          {payments.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <ul className="max-h-[36rem] divide-y divide-border overflow-y-auto">
              {payments.map((p) => {
                const open = expanded.has(p.id);
                const dept = String(p?.meta?.department || "").trim().toLowerCase();
                return (
                  <li key={p.id} className="px-5 py-3 transition-colors hover:bg-row-hover">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => toggleExpand(p.id)}
                        aria-expanded={open}
                        className="min-w-0 text-left">
                        <p className="flex items-center gap-1 font-semibold text-foreground">
                          {p.order_number != null ? `#${p.order_number}` : "Payment"}
                          <span className="font-normal text-muted-foreground">
                            · {humanize(p.payment_method)}
                          </span>
                          {open ? (
                            <ChevronUp className="size-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="size-3.5 text-muted-foreground" />
                          )}
                        </p>
                        <p className="text-meta text-muted-foreground">
                          {clockTime(p.paid_at || p.created_at)}
                          {dept ? ` · ${prettyDept(dept, deptLabels)}` : ""}
                        </p>
                      </button>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-semibold text-foreground">{formatCurrency(p.amount)}</span>
                        <StatusBadge kind="payment" status={p.status} />
                      </div>
                    </div>
                    {open ? (
                      <dl className="mt-2 space-y-1 border-t border-dashed border-border pt-2 text-meta">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Order</dt>
                          <dd className="text-foreground">#{p.order_number ?? p.order_id ?? "—"}</dd>
                        </div>
                        {p.table_number != null ? (
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">Table</dt>
                            <dd className="text-foreground">{p.table_number}</dd>
                          </div>
                        ) : null}
                        {p.processed_by_name ? (
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">By</dt>
                            <dd className="text-foreground">{p.processed_by_name}</dd>
                          </div>
                        ) : null}
                      </dl>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        </div>
      </div>

      {/* Confirm payment modal (narrow screens) */}
      <Dialog open={!!confirmTarget && !isWide} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <p className="eyebrow">Current order</p>
            <DialogTitle className="text-[22px] leading-tight">{confirmTitle}</DialogTitle>
            <DialogDescription>{confirmHint}</DialogDescription>
          </DialogHeader>
          {chargeBody}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button onClick={doConfirm} disabled={!confirmKey || processing.has(confirmKey)}>
              Charge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settle-table (batch) modal */}
      <Dialog
        open={settleTableOpen}
        onOpenChange={(o) => {
          if (!o && !settlingTable) setSettleTableOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <p className="eyebrow">Charge all</p>
            <DialogTitle className="text-[22px] leading-tight">Table {selectedTable}</DialogTitle>
            <DialogDescription>
              {tableSettleTasks.length} {tableSettleTasks.length === 1 ? "payment" : "payments"}
              {isAttached ? " for your department" : ""} will be recorded. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="flex items-baseline justify-between border-b border-dashed border-border pb-4">
              <span className="text-base font-semibold text-foreground">Total</span>
              <span className="text-kpi text-foreground">{formatCurrency(tableSettleTotal)}</span>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Paid with</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Payment method">
                {PAYMENT_METHODS.map((m) => (
                  <Button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={confirmMethod === m.value}
                    variant={confirmMethod === m.value ? "selected" : "outline"}
                    disabled={settlingTable}
                    onClick={() => setConfirmMethod(m.value)}>
                    {m.label}
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-meta text-muted-foreground">Used for every payment in this batch.</p>
            </div>
            {settleProgress ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <RefreshCw className="size-3.5 animate-spin" />
                Settling {settleProgress.done} of {settleProgress.total}…
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSettleTableOpen(false)}
              disabled={settlingTable}
            >
              Cancel
            </Button>
            <Button onClick={doSettleTable} disabled={settlingTable || tableSettleTasks.length === 0}>
              {settlingTable ? <RefreshCw className="animate-spin" /> : null}
              {settlingTable ? "Settling…" : `Charge ${tableSettleTasks.length} ${tableSettleTasks.length === 1 ? "payment" : "payments"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel order modal */}
      <Dialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o) {
            setCancelTarget(null);
            setCancelPwd("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel order</DialogTitle>
            <DialogDescription>
              Cancel order #{cancelTarget?.order_number ?? ""}
              {cancelTarget?.table_number != null ? ` (Table ${cancelTarget.table_number})` : ""}?
              This voids the order and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {cancelPwdRequired ? (
            <div className="space-y-1.5 py-1">
              <Label htmlFor="cancel-pwd">Cancel password</Label>
              <Input
                id="cancel-pwd"
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
                setCancelTarget(null);
                setCancelPwd("");
              }}
            >
              Keep order
            </Button>
            <Button variant="destructive" onClick={doCancel} disabled={verifyingCancel}>
              {verifyingCancel ? "Checking…" : "Cancel order"}
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
        onSaved={() => loadQueue(true)}
      />
    </div>
  );
}
