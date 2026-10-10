import { useState, useEffect, useMemo, useCallback } from "react";
import api from "@/application";
import toast from "react-hot-toast";
import { useHistoryLookbackDays } from "@/shared/hooks/useHistoryLookbackDays";
import { getApproximateServerDateString } from "@/shared/utils/serverTime";
import { PaymentRecord, PendingOrderRecord } from "../types";
import { formatETB } from '@/lib/format';

const PAGE_SIZE = 25;

// Local calendar date (YYYY-MM-DD) offset by `daysAgo`, built from the local
// clock (not UTC) so it never drifts a day around midnight.
const localDateString = (daysAgo = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Map the day filter to an inclusive backend date window (YYYY-MM-DD bounds).
// Presets resolve to fixed windows; 'custom' uses the picked from/to (either
// bound may be omitted). 'all' (and an empty custom range) return null.
const dateWindowFor = (
  filterDate: string,
  customFrom?: string,
  customTo?: string,
): { date_from?: string; date_to?: string } | null => {
  if (filterDate === "today") {
    const d = localDateString(0);
    return { date_from: d, date_to: d };
  }
  if (filterDate === "yesterday") {
    const d = localDateString(1);
    return { date_from: d, date_to: d };
  }
  if (filterDate === "week") {
    return { date_from: localDateString(6), date_to: localDateString(0) };
  }
  if (filterDate === "month") {
    return { date_from: localDateString(29), date_to: localDateString(0) };
  }
  if (filterDate === "custom") {
    const from = customFrom || undefined;
    const to = customTo || undefined;
    if (!from && !to) return null;
    return { date_from: from, date_to: to };
  }
  return null;
};

export const usePaymentData = () => {
  // Per-role history lookback (days back; null = unlimited), kept fresh by the
  // sync loop. Everything the page pulls (table page, stat aggregate, pending
  // list) is floored to this.
  const lookbackDays = useHistoryLookbackDays();
  const floorDate = lookbackDays == null ? null : localDateString(lookbackDays);

  const [loading, setLoading] = useState(true);
  // Full windowed set used only for the aggregate stat cards.
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  // Single backend page rendered by the table (status !== 'pending').
  const [pagePayments, setPagePayments] = useState<PaymentRecord[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [ordersForPayment, setOrdersForPayment] = useState<
    PendingOrderRecord[]
  >([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMethod, setFilterMethod] = useState("all");
  // Calendar-day scope for the table:
  // 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'.
  const [filterDate, setFilterDate] = useState("all");
  // Custom range bounds (YYYY-MM-DD), used only when filterDate === 'custom'.
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewPayment, setViewPayment] = useState<any>(null);
  const [viewOrder, setViewOrder] = useState<any>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);

  // Aux data for the stat cards + filters. Loaded once; not paginated because
  // the stat cards aggregate over the whole window.
  const fetchAux = useCallback(async () => {
    try {
      // Floor the aggregate window so the stat cards never count payments the
      // role isn't allowed to see.
      const paymentsParams = floorDate ? { date_from: floorDate } : undefined;
      const [pr, or, pm] = await Promise.all([
        api.payments.getAll(paymentsParams),
        api.orders.getOrdersForPayment(),
        api.settings.getPaymentMethods(),
      ]);
      setPayments(
        (pr as any)?.data?.data?.payments ?? (pr as any)?.data?.payments ?? [],
      );
      setOrdersForPayment(
        (or as any)?.data?.data?.orders ?? (or as any)?.data?.orders ?? [],
      );
      const methodsList =
        (pm as any)?.data?.data?.payment_methods ??
        (pm as any)?.data?.payment_methods ??
        [];
      setPaymentMethods(Array.isArray(methodsList) ? methodsList : []);
    } catch {
      toast.error("Failed to load payments");
    }
  }, [floorDate]);

  useEffect(() => {
    fetchAux();
  }, [fetchAux]);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reset to the first page whenever the result set changes.
  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    filterStatus,
    filterMethod,
    filterDate,
    customFrom,
    customTo,
  ]);

  // Fetch one backend page for the table. The 'pending' filter shows orders
  // awaiting payment (a separate, bounded list) and is sliced locally below.
  const fetchPage = useCallback(async () => {
    if (filterStatus === "pending") {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const params: any = { page, limit: PAGE_SIZE };
      if (filterStatus !== "all") params.status = filterStatus;
      if (filterMethod !== "all") params.payment_method = filterMethod;
      if (debouncedSearch) params.search = debouncedSearch;
      const dateWindow = dateWindowFor(filterDate, customFrom, customTo);
      if (dateWindow) {
        if (dateWindow.date_from) params.date_from = dateWindow.date_from;
        if (dateWindow.date_to) params.date_to = dateWindow.date_to;
      } else if (floorDate) {
        // 'All' within the role's allowed window (never older than floorDate).
        params.date_from = floorDate;
      }
      // Never let an explicit day window reach past the role's lookback floor.
      if (floorDate && (!params.date_from || params.date_from < floorDate)) {
        params.date_from = floorDate;
      }
      const res = await api.payments.getHistory(params);
      const data = (res as any)?.data?.data ?? (res as any)?.data ?? {};
      setPagePayments(Array.isArray(data.payments) ? data.payments : []);
      setServerTotal(Number(data.count ?? 0));
    } catch {
      toast.error("Failed to load payments");
      setPagePayments([]);
      setServerTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    filterStatus,
    filterMethod,
    filterDate,
    customFrom,
    customTo,
    debouncedSearch,
    floorDate,
  ]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  // The 'pending' branch maps orders awaiting payment and is paginated locally.
  const pendingRows = useMemo(() => {
    if (filterStatus !== "pending") return [];
    const dateWindow = dateWindowFor(filterDate, customFrom, customTo);
    return ordersForPayment
      .filter((o) => !debouncedSearch || String(o.id).includes(debouncedSearch))
      .filter((o) => {
        const when = o.created_at || o.updated_at;
        if (typeof when !== "string") return !dateWindow && !floorDate;
        const day = when.slice(0, 10);
        // A date window matches inclusively between its (optional) bounds;
        // otherwise honor the role's lookback floor so out-of-window orders
        // never show.
        if (dateWindow) {
          if (dateWindow.date_from && day < dateWindow.date_from) return false;
          if (dateWindow.date_to && day > dateWindow.date_to) return false;
          return true;
        }
        if (floorDate) {
          return day >= floorDate;
        }
        return true;
      })
      .map(
        (o) =>
          ({
            __type: "order_pending",
            id: `ORDER-${o.id}`,
            order_id: o.id,
            amount: o.total_amount,
            payment_method: null,
            status: "pending",
            created_at: o.updated_at || o.created_at,
          }) as PaymentRecord,
      );
  }, [
    filterStatus,
    ordersForPayment,
    debouncedSearch,
    filterDate,
    customFrom,
    customTo,
    floorDate,
  ]);

  const filteredPayments = useMemo(() => {
    if (filterStatus === "pending") {
      const start = (page - 1) * PAGE_SIZE;
      return pendingRows.slice(start, start + PAGE_SIZE);
    }
    return pagePayments;
  }, [filterStatus, pendingRows, pagePayments, page]);

  const totalCount =
    filterStatus === "pending" ? pendingRows.length : serverTotal;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const openView = useCallback(async (payment: any) => {
    try {
      setViewOpen(true);
      setViewLoading(true);
      setViewPayment(null);
      setViewOrder(null);
      const isPending = payment?.__type === "order_pending";
      const [pr, or] = await Promise.all([
        !isPending && payment?.id
          ? api.payments.getById(payment.id).catch(() => null)
          : Promise.resolve(null),
        payment?.order_id
          ? api.orders.getById(payment.order_id).catch(() => null)
          : Promise.resolve(null),
      ]);
      setViewPayment(
        isPending
          ? payment
          : ((pr as any)?.data?.data?.payment ??
              (pr as any)?.data?.payment ??
              payment),
      );
      setViewOrder(
        (or as any)?.data?.data?.order ?? (or as any)?.data?.order ?? null,
      );
    } catch {
      toast.error("Failed to load details");
    } finally {
      setViewLoading(false);
    }
  }, []);

  const stats = useMemo(() => {
    const today = getApproximateServerDateString();
    // Offline, getAll returns the whole local table regardless of the requested
    // window, so floor the aggregate here too — a restricted role must never see
    // counts/revenue from days outside its lookback.
    const inWindow = (p: any) => {
      if (!floorDate) return true;
      const when = (p.paid_at || p.created_at || "").slice(0, 10);
      return when >= floorDate;
    };
    const visiblePayments = payments.filter(inWindow);
    const todayRevenueVal = visiblePayments
      .filter((p) => {
        if (p.status !== "paid") return false;
        // paid_at is the real payment time; created_at can be the sync time for
        // payments that originated offline, which would drop them from today.
        const when = (p as any).paid_at || p.created_at;
        return when?.startsWith(today);
      })
      .reduce((s, p) => s + parseFloat(String(p.amount || 0)), 0);

    return {
      pendingCount: ordersForPayment.length,
      todayRevenue: `${formatETB(todayRevenueVal)}`,
      completedCount: visiblePayments.filter((p) => p.status === "paid").length,
    };
  }, [payments, ordersForPayment, floorDate]);

  return {
    loading,
    searchTerm,
    setSearchTerm,
    filterStatus,
    setFilterStatus,
    filterMethod,
    setFilterMethod,
    filterDate,
    setFilterDate,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    lookbackDays,
    // Earliest calendar day this role may view (YYYY-MM-DD); null = unlimited.
    // Used as the min bound on the custom date pickers.
    floorDate,
    viewOpen,
    setViewOpen,
    viewLoading,
    viewPayment,
    viewOrder,
    filteredPayments,
    ordersForPayment,
    openView,
    stats,
    paymentMethods,
    page,
    setPage,
    pageSize: PAGE_SIZE,
    totalCount,
    totalPages,
  };
};

export default usePaymentData;
