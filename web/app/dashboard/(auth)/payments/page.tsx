"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  EyeIcon,
  WalletIcon,
  BanknoteIcon,
  ClockIcon,
  CalculatorIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DataTable, type Column, type SortState } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatCards, type StatCard } from "@/components/stat-cards";
import { Payments } from "@/lib/resources";
import { formatETB, shortDate } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";

type Payment = {
  id: string;
  order_id: string | null;
  order_number: number | null;
  amount: number | null;
  payment_method: string | null;
  status: string | null;
  paid_at: string | null;
  created_at: string;
  // Set when the till sent a different amount than the order's total at
  // payment time — the amount actually recorded is always the order's true
  // total (see backend payment.service.create / order.service.syncPayment),
  // this is only a record of the disagreement.
  meta?: {
    amount_mismatch?: boolean;
    client_sent_amount?: number;
    order_total_at_payment?: number;
  } | null;
};

// The backend serializes paid_at/created_at as the payment's *order* created
// time (so every interface dates a payment by its order, not when the money was
// taken — the true times are on actual_paid_at/payment_created_at).
const paymentDate = (r: Payment) => r.paid_at || r.created_at;

const columns: Column<Payment>[] = [
  { key: "id", label: "Payment", render: (r) => <span className="font-mono text-xs">{r.id.slice(0, 8)}</span> },
  {
    key: "order_number",
    label: "Order",
    sortable: true,
    render: (r) =>
      r.order_id ? (
        <Link
          href={`/dashboard/orders?focus=${r.order_id}`}
          className="font-semibold text-primary hover:underline"
        >
          #{r.order_number ?? "—"}
        </Link>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "amount",
    label: "Amount",
    sortable: true,
    render: (r) =>
      r.meta?.amount_mismatch ? (
        <span
          className="inline-flex items-center gap-1.5 text-warning"
          title={`Till sent ${formatETB(r.meta.client_sent_amount ?? null)}; order total was ${formatETB(
            r.meta.order_total_at_payment ?? null,
          )}. Recorded amount was corrected to the order total.`}
        >
          <TriangleAlertIcon className="size-3.5 shrink-0" />
          {formatETB(r.amount)}
        </span>
      ) : (
        formatETB(r.amount)
      ),
  },
  { key: "payment_method", label: "Method", render: (r) => <span className="capitalize">{r.payment_method ?? "—"}</span> },
  { key: "status", label: "Status", render: (r) => <StatusBadge kind="payment" status={r.status} /> },
  { key: "paid_at", label: "Date", render: (r) => shortDate(paymentDate(r)) },
];

const PAGE_SIZE = 25;

export default function PaymentsPage() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [count, setCount] = useState(0);
  const [serverStats, setServerStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [flag, setFlag] = useState("");
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [sort, setSort] = useState<SortState | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const reload = useCallback(() => {
    setLoading(true);
    const params: Record<string, any> = { page: page + 1, limit: PAGE_SIZE };
    if (debouncedSearch) params.search = debouncedSearch;
    if (status) params.status = status;
    if (flag === "amount_mismatch") params.amount_mismatch = "true";
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (sort) {
      params.sort_by = sort.key;
      params.sort_dir = sort.dir;
    }
    return Payments.page<Payment>(params)
      .then((res) => {
        setRows(res.rows);
        setCount(res.count);
        setServerStats(res.stats);
      })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, status, flag, dateFrom, dateTo, sort]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Stats come from the server over the whole filtered window, not just the page.
  const cards: StatCard[] = useMemo(() => {
    const collected = serverStats.collected ?? 0;
    const paidCount = serverStats.paid_count ?? 0;
    return [
      { label: "Total payments", value: serverStats.total_payments ?? 0, icon: WalletIcon },
      {
        label: "Collected",
        value: formatETB(collected),
        hint: `${paidCount} paid`,
        icon: BanknoteIcon,
        valueClass: "text-success",
      },
      {
        label: "Pending",
        value: serverStats.pending ?? 0,
        hint: "Awaiting confirmation",
        icon: ClockIcon,
        valueClass: "text-warning",
      },
      {
        label: "Avg payment",
        value: formatETB(serverStats.avg ?? 0),
        hint: "Paid only",
        icon: CalculatorIcon,
      },
      {
        label: "Flagged",
        value: serverStats.mismatch_count ?? 0,
        hint: "Till amount ≠ order total",
        icon: TriangleAlertIcon,
        valueClass:
          (serverStats.mismatch_count ?? 0) > 0
            ? "text-warning"
            : undefined,
      },
    ];
  }, [serverStats]);

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Payment history for this branch." />

      <StatCards cards={cards} loading={loading} />

      <DataTable<Payment>
        columns={columns}
        rows={rows}
        loading={loading}
        searchPlaceholder="Search payments…"
        server={{
          total: count,
          page,
          pageSize: PAGE_SIZE,
          onPageChange: setPage,
          onSearchChange: setSearch,
          onFilterChange: (key, value) => {
            setPage(0);
            if (key === "status") setStatus(value);
            if (key === "flag") setFlag(value);
          },
          onRangeChange: (_key, range) => {
            setPage(0);
            setDateFrom(range.from);
            setDateTo(range.to);
          },
          onSortChange: (s) => {
            setPage(0);
            setSort(s);
          },
        }}
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "paid", label: "Paid" },
              { value: "cancelled", label: "Cancelled" },
            ],
          },
          {
            key: "flag",
            label: "Flag",
            options: [
              { value: "amount_mismatch", label: "Amount mismatch" },
            ],
          },
        ]}
        dateFilters={[{ key: "paid_at", label: "Date", getDate: (r) => paymentDate(r) }]}
        rowActions={(r) => (
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/payments/${r.id}`}>
              <EyeIcon />
              View
            </Link>
          </Button>
        )}
      />
    </div>
  );
}
