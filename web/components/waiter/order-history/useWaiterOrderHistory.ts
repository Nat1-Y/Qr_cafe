"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { waiterServices as api } from "@/lib/waiter/api";
import { useWaiterAuth } from "@/components/waiter/auth-context";
import { toast } from "sonner";
import { Clock, CheckCircle, AlertCircle, DollarSign } from "lucide-react";
import { formatETB } from "@/lib/format";

// sessionStorage handoff key for "Add Items" navigation — the create-order
// page reads this back to pre-load the target order's context. Next.js
// client navigation has no React-Router-style `state` option, so this is the
// equivalent mechanism (mirrors the desktop cashier flow's own
// sessionStorage handoff for its target waiter).
export const ADD_ITEMS_ORDER_SESSION_KEY = "waiter_add_items_order_v1";

// Local calendar date (YYYY-MM-DD) `daysAgo` days before today.
const ymdLocal = (daysAgo: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const useWaiterOrderHistory = () => {
  const { user, logout } = useWaiterAuth();
  const router = useRouter();

  // Per-role history lookback (days back; null/absent = unlimited). This portal
  // uses a device token (no JWT role) so the backend can't scope it — the query
  // and the client-side filter below enforce the window instead.
  const lookbackDays = (user as any)?.history_lookback_days ?? null;
  const floorDate = lookbackDays == null ? "" : ymdLocal(lookbackDays);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  // Item-addition audit trail, keyed by order id — "Added later" block on
  // each order card, visually separate from the order's original items.
  const [additionsByOrderId, setAdditionsByOrderId] = useState<
    Record<string, any[]>
  >({});

  const normalizeStatus = useCallback(
    (s: any) =>
      String(s || "")
        .toLowerCase()
        .replace(/[^a-z]/g, "")
        .trim(),
    [],
  );

  const getEffectiveStatus = useCallback(
    (order: any) => {
      const pst = normalizeStatus(order?.payment_status);
      if (pst === "paid") return "paid";
      const st = normalizeStatus(order?.status);
      return st || "pending";
    },
    [normalizeStatus],
  );

  const handleLogout = useCallback(() => {
    logout();
    router.push("/waiter/login");
  }, [logout, router]);

  const extractOrdersFromResponse = useCallback((response: any) => {
    const payload = response?.data;
    const candidates = [
      payload?.data?.orders,
      payload?.orders,
      payload?.data?.items,
      payload?.items,
      payload?.data,
      payload,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }

    return [];
  }, []);

  // Fetch waiter's orders
  useEffect(() => {
    if (!user?.id) return;

    let isFirstLoad = true;

    const fetchData = async () => {
      if (isFirstLoad) {
        setLoading(true);
      }
      try {
        const [ordersResult, additionsResult] = await Promise.allSettled([
          api.orders.getAll({
            employee_id: user.id,
            type: "cafe",
            ...(floorDate ? { date_from: floorDate } : {}),
          }),
          api.orders.getItemAdditions(floorDate || undefined),
        ]);

        const ordersRaw =
          ordersResult?.status === "fulfilled"
            ? extractOrdersFromResponse(ordersResult.value)
            : [];
        const safeOrders = Array.isArray(ordersRaw) ? ordersRaw : [];

        setOrders(safeOrders);

        const orderIds = new Set(safeOrders.map((o: any) => o.id));
        const additionsRaw =
          additionsResult?.status === "fulfilled"
            ? ((additionsResult.value as any)?.data?.data?.itemAdditions ??
              (additionsResult.value as any)?.data?.itemAdditions ??
              [])
            : [];
        const grouped: Record<string, any[]> = {};
        for (const addition of Array.isArray(additionsRaw) ? additionsRaw : []) {
          if (!orderIds.has(addition?.order_id)) continue;
          const key = String(addition.order_id);
          (grouped[key] ||= []).push(addition);
        }
        setAdditionsByOrderId(grouped);
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Failed to load order history");
      } finally {
        setLoading(false);
        isFirstLoad = false;
      }
    };

    fetchData();
    const intervalId = setInterval(fetchData, 10000);
    return () => clearInterval(intervalId);
  }, [user?.id, floorDate, extractOrdersFromResponse]);

  const getStatusDisplay = useCallback((status: string) => {
    const statusConfig: { [key: string]: any } = {
      pending: { icon: Clock, variant: "warning" as const, label: "Pending" },
      preparing: { icon: Clock, variant: "info" as const, label: "Preparing" },
      ready: { icon: CheckCircle, variant: "success" as const, label: "Ready" },
      paid: { icon: DollarSign, variant: "success" as const, label: "Paid" },
      completed: {
        icon: CheckCircle,
        variant: "secondary" as const,
        label: "Completed",
      },
      cancelled: {
        icon: AlertCircle,
        variant: "destructive" as const,
        label: "Cancelled",
      },
    };

    return statusConfig[status] || statusConfig.pending;
  }, []);

  const formatDate = useCallback((dateString: any) => {
    const date = new Date(dateString);
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }, []);

  const canAddItems = useCallback(
    (order: any) => {
      // Only the order's creator may add items — the backend enforces this
      // too (403 otherwise); gate the button so it isn't offered where it
      // would just be rejected. created_by_id is cashier_id when a cashier
      // rang the order up on the waiter's behalf, else waiter_id.
      const creatorId = order?.created_by_id ?? order?.waiter_id ?? order?.employee_id;
      if (creatorId == null || user?.id == null || String(creatorId) !== String(user.id)) {
        return false;
      }
      // Backend rejects item additions once payment_status is "paid"
      // (order.service.ts assertCanModifyOrderItems) — gate the button here
      // too, or clicking it just queues an addition that fails forever.
      if (String(order?.payment_status || "").toLowerCase() === "paid") {
        return false;
      }
      const effectiveStatus = getEffectiveStatus(order);
      // Items can be added to an open order or a served ("done") one (which
      // reopens it). preparing/ready are folded into these two states.
      return ["pending", "done"].includes(effectiveStatus);
    },
    [getEffectiveStatus, user?.id],
  );

  // "Add Items" navigates to the full order-creation screen pre-loaded with
  // this order, instead of a small inline picker here.
  const goAddItems = useCallback(
    (order: any) => {
      try {
        sessionStorage.setItem(ADD_ITEMS_ORDER_SESSION_KEY, JSON.stringify(order));
      } catch {
        // Storage unavailable — the create-order page falls back to
        // create-new-order mode, a non-destructive degrade.
      }
      router.push(`/waiter/create-order?orderId=${order.id}`);
    },
    [router],
  );

  const formatCurrency = formatETB;

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const orderDateStr = String(order.created_at || "").slice(0, 10);
      // Enforce the role's lookback floor even if an older order slipped in.
      if (floorDate && orderDateStr && orderDateStr < floorDate) return false;
      // Date filter matching "YYYY-MM-DD"
      if (selectedDate) {
        if (orderDateStr !== selectedDate) return false;
      }
      // Search filter matching Order ID or Table Number
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesId = String(order.id).includes(query);
        const matchesTable = String(order.table_number || "")
          .toLowerCase()
          .includes(query);
        if (!matchesId && !matchesTable) return false;
      }
      return true;
    });
  }, [orders, selectedDate, searchQuery, floorDate]);

  const historyStats = useMemo(() => {
    let revenue = 0;
    const activeTables = new Set<string>();

    filteredOrders.forEach((order) => {
      const pst = normalizeStatus(order?.payment_status);
      const st = normalizeStatus(order?.status);
      // Revenue is money collected, so key off the payment axis. ("done" is
      // fulfilled, not necessarily paid; legacy paid/completed kept tolerant.)
      if (pst === "paid" || st === "paid" || st === "completed") {
        revenue += parseFloat(order.total_amount || 0);
      }
      if (order.table_number) {
        activeTables.add(String(order.table_number));
      }
    });

    return {
      revenue: revenue.toFixed(2),
      activeTablesCount: activeTables.size,
      ordersCount: filteredOrders.length,
    };
  }, [filteredOrders, normalizeStatus]);

  return {
    loading,
    orders,
    filteredOrders,
    selectedDate,
    setSelectedDate,
    // Earliest date the waiter may pick / see (empty = no limit).
    minDate: floorDate,
    searchQuery,
    setSearchQuery,
    historyStats,
    additionsByOrderId,
    getEffectiveStatus,
    getStatusDisplay,
    formatDate,
    canAddItems,
    goAddItems,
    handleLogout,
    formatCurrency,
  };
};
