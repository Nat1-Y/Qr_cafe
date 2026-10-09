"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRightIcon,
  ArrowRightIcon,
  MinusIcon,
  PlusIcon,
  ScaleIcon,
  ScrollTextIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatCards, type StatCard } from "@/components/stat-cards";
import { Inventory, StockLocations } from "@/lib/resources";
import { shortDate } from "@/lib/format";

type LedgerEntry = {
  id: string;
  item_name?: string | null;
  base_unit?: string | null;
  movement_type: string;
  location_name?: string | null;
  quantity_delta: number;
  quantity_after: number | null;
  quantity_before: number | null;
  transfer_id?: string | null;
  transfer_from_location_name?: string | null;
  transfer_to_location_name?: string | null;
  order_id?: string | null;
  order_number?: number | null;
  notes?: string | null;
  user_name?: string | null;
  created_at: string;
};

const TYPE_BADGE: Record<string, "success" | "warning" | "destructive" | "info" | "secondary" | "muted"> = {
  sale: "destructive",
  sale_reversal: "info",
  transfer_out: "warning",
  transfer_in: "success",
  adjustment: "secondary",
  count: "secondary",
  initial: "muted",
};

const TYPE_LABEL: Record<string, string> = {
  sale: "Sale",
  sale_reversal: "Sale reversal",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
  adjustment: "Adjustment",
  count: "Stock count",
  initial: "Initial stock",
};

const PAGE_SIZE = 25;

export default function InventoryLedgerPage() {
  const [rows, setRows] = useState<LedgerEntry[]>([]);
  const [count, setCount] = useState(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [movementType, setMovementType] = useState("");
  const [locationId, setLocationId] = useState("");
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    StockLocations.list()
      .then(setLocations)
      .catch((e: any) => toast.error(e.message));
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    const params: Record<string, any> = { page: page + 1, limit: PAGE_SIZE };
    if (debouncedSearch) params.search = debouncedSearch;
    if (movementType) params.movement_type = movementType;
    if (locationId) params.location_id = locationId;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    return Inventory.ledger(params)
      .then((res) => {
        setRows(res.rows);
        setCount(res.count);
        setStats(res.stats as Record<string, number>);
      })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, movementType, locationId, dateFrom, dateTo]);

  useEffect(() => {
    reload();
  }, [reload]);

  const cards: StatCard[] = [
    { label: "Total entries", value: stats.total_movements ?? 0, icon: ScrollTextIcon },
    {
      label: "Added",
      value: (stats.total_in ?? 0).toLocaleString(),
      hint: "Stock-ins, reversals, transfers in",
      icon: TrendingUpIcon,
      valueClass: "text-emerald-600 dark:text-emerald-500",
    },
    {
      label: "Deducted",
      value: (stats.total_out ?? 0).toLocaleString(),
      hint: "Sales, transfers out",
      icon: TrendingDownIcon,
      valueClass: "text-red-600 dark:text-red-500",
    },
    {
      label: "Net change",
      value: (stats.net_change ?? 0).toLocaleString(),
      icon: ScaleIcon,
      valueClass:
        (stats.net_change ?? 0) < 0
          ? "text-red-600 dark:text-red-500"
          : "text-emerald-600 dark:text-emerald-500",
    },
  ];

  const columns: Column<LedgerEntry>[] = [
    { key: "created_at", label: "Date", className: "text-muted-foreground", render: (r) => shortDate(r.created_at) },
    {
      key: "item_name",
      label: "Item",
      render: (r) => (
        <div>
          <div className="font-medium">{r.item_name ?? "—"}</div>
          <div className="text-muted-foreground text-xs">{r.location_name ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "movement_type",
      label: "Type",
      render: (r) => (
        <Badge variant={TYPE_BADGE[r.movement_type] ?? "muted"}>
          {TYPE_LABEL[r.movement_type] ?? r.movement_type}
        </Badge>
      ),
    },
    {
      key: "quantity_delta",
      label: "Change",
      sortable: true,
      render: (r) => {
        const positive = r.quantity_delta > 0;
        return (
          <span
            className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${
              positive ? "text-emerald-600 dark:text-emerald-500" : "text-red-600 dark:text-red-500"
            }`}>
            {positive ? <PlusIcon className="size-3" /> : <MinusIcon className="size-3" />}
            {Math.abs(r.quantity_delta)} {r.base_unit ?? ""}
          </span>
        );
      },
    },
    {
      key: "quantity_after",
      label: "Balance left",
      render: (r) => (
        <span className="font-semibold tabular-nums">
          {r.quantity_after ?? "—"} {r.base_unit ?? ""}
        </span>
      ),
    },
    {
      key: "reference",
      label: "Reference",
      render: (r) => {
        if (r.order_id) {
          return (
            <Link
              href={`/dashboard/orders?focus=${r.order_id}`}
              className="text-primary font-medium hover:underline">
              Order #{r.order_number ?? "—"}
            </Link>
          );
        }
        if (r.transfer_id) {
          return (
            <Link
              href={`/dashboard/inventory/transfers/${r.transfer_id}`}
              className="text-primary inline-flex items-center gap-1 font-medium hover:underline">
              <ArrowLeftRightIcon className="size-3" />
              {r.transfer_from_location_name ?? "—"}
              <ArrowRightIcon className="size-3" />
              {r.transfer_to_location_name ?? "—"}
            </Link>
          );
        }
        return <span className="text-muted-foreground">—</span>;
      },
    },
    { key: "user_name", label: "By", className: "text-muted-foreground", render: (r) => r.user_name ?? "System" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Ledger"
        description="Full audit trail of every stock deduction and addition, with the balance left after each entry."
      />

      <StatCards cards={cards} loading={loading} />

      <DataTable<LedgerEntry>
        columns={columns}
        rows={rows}
        loading={loading}
        searchPlaceholder="Search by item name…"
        server={{
          total: count,
          page,
          pageSize: PAGE_SIZE,
          onPageChange: setPage,
          onSearchChange: setSearch,
          onFilterChange: (key, value) => {
            setPage(0);
            if (key === "movement_type") setMovementType(value);
            if (key === "location") setLocationId(value);
          },
          onRangeChange: (_key, range) => {
            setPage(0);
            setDateFrom(range.from);
            setDateTo(range.to);
          },
        }}
        emptyMessage="No stock movements recorded yet."
        filters={[
          {
            key: "movement_type",
            label: "Type",
            options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
          },
          {
            key: "location",
            label: "Location",
            options: locations.map((l) => ({ value: l.id, label: l.name })),
          },
        ]}
        dateFilters={[{ key: "created_at", label: "Date", getDate: (r) => r.created_at }]}
      />
    </div>
  );
}
