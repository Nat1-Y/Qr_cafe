"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftRightIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ClockIcon,
  EyeIcon,
  Link2Icon,
  PackageIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatCards, type StatCard } from "@/components/stat-cards";
import { Inventory, StockLocations } from "@/lib/resources";
import { shortDate, humanize } from "@/lib/format";
import { friendlyError } from "@/lib/errors";

type Line = { inventory_item_id: string; quantity: string };
type TransferItem = {
  id: string;
  inventory_item_id: string;
  item_name?: string | null;
  base_unit?: string | null;
  quantity: number;
  received_as_name?: string | null;
  received_quantity?: number | null;
};
type Transfer = {
  id: string;
  from_location_id: string;
  to_location_id: string;
  from_location_name?: string | null;
  to_location_name?: string | null;
  status: string;
  notes?: string | null;
  created_by_name?: string | null;
  received_by_name?: string | null;
  received_at?: string | null;
  created_at: string;
  item_count: number;
  total_quantity: number;
  items: TransferItem[];
};

const STATUS_BADGE: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  sent: "warning",
  received: "success",
  cancelled: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  sent: "Not received yet",
  received: "Received",
  cancelled: "Cancelled",
};

const PAGE_SIZE = 10;

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [count, setCount] = useState(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [locations, setLocations] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [lines, setLines] = useState<Line[]>([{ inventory_item_id: "", quantity: "" }]);

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
    if (statusFilter) params.status = statusFilter;
    return Inventory.transfers(params)
      .then((res) => {
        setTransfers(res.rows);
        setCount(res.count);
        setStats(res.stats as Record<string, number>);
      })
      .catch((e: any) => toast.error(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    Promise.all([StockLocations.list(), Inventory.list()])
      .then(([l, i]) => {
        setLocations(l);
        setItems(i);
      })
      .catch((e: any) => toast.error(friendlyError(e)));
  }, []);

  async function submit() {
    const validLines = lines
      .filter((l) => l.inventory_item_id && Number(l.quantity) > 0)
      .map((l) => ({ inventory_item_id: l.inventory_item_id, quantity: Number(l.quantity) }));
    if (!from || !to || validLines.length === 0) {
      toast.error("Pick both places and at least one item.");
      return;
    }
    try {
      await Inventory.createTransfer({ from_location_id: from, to_location_id: to, items: validLines });
      toast.success("Stock moved");
      setOpen(false);
      setLines([{ inventory_item_id: "", quantity: "" }]);
      setFrom("");
      setTo("");
      await reload();
    } catch (e: any) {
      toast.error(friendlyError(e));
    }
  }

  const cards: StatCard[] = [
    { label: "Total stock moves", value: stats.total ?? 0, icon: ArrowLeftRightIcon },
    {
      label: "Not received yet",
      value: stats.sent ?? 0,
      hint: "Sent, not received yet",
      icon: ClockIcon,
      valueClass: "text-warning",
    },
    {
      label: "Received",
      value: stats.received ?? 0,
      icon: CheckCircle2Icon,
      valueClass: "text-success",
    },
    {
      label: "Units moved",
      value: (stats.total_quantity ?? 0).toLocaleString(),
      hint: "Since you started",
      icon: PackageIcon,
    },
  ];

  const columns: Column<Transfer>[] = [
    {
      key: "route",
      label: "From → to",
      searchValue: (t) => `${t.from_location_name ?? ""} ${t.to_location_name ?? ""}`,
      render: (t) => (
        <div className="flex items-center gap-1.5 font-medium">
          <span>{t.from_location_name ?? "—"}</span>
          <ArrowRightIcon className="text-muted-foreground size-3.5 shrink-0" />
          <span>{t.to_location_name ?? "—"}</span>
        </div>
      ),
    },
    {
      key: "items",
      label: "Items",
      render: (t) => (
        <div>
          <div className="font-medium">
            {t.item_count} item{t.item_count === 1 ? "" : "s"}
          </div>
          <div className="text-muted-foreground text-xs">
            {t.total_quantity.toLocaleString()} units total
          </div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (t) => (
        <Badge variant={STATUS_BADGE[t.status] ?? "muted"}>
          {STATUS_LABEL[t.status] ?? humanize(t.status)}
        </Badge>
      ),
    },
    {
      key: "created_by_name",
      label: "Created by",
      className: "text-muted-foreground",
      render: (t) => t.created_by_name ?? "—",
    },
    {
      key: "received",
      label: "Received by",
      className: "text-muted-foreground",
      render: (t) =>
        t.received_by_name ? (
          <div>
            <div className="text-foreground">{t.received_by_name}</div>
            <div className="text-xs">{shortDate(t.received_at)}</div>
          </div>
        ) : (
          "—"
        ),
    },
    {
      key: "created_at",
      label: "Date",
      className: "text-muted-foreground",
      render: (t) => shortDate(t.created_at),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Move stock"
        description="Move stock between places. We keep how much is left in each place."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/inventory/links">
                <Link2Icon />
                Pack contents
              </Link>
            </Button>
            <Button onClick={() => setOpen(true)}>
              <PlusIcon />
              Move stock
            </Button>
          </div>
        }
      />

      <StatCards cards={cards} loading={loading} />

      <DataTable<Transfer>
        columns={columns}
        rows={transfers}
        loading={loading}
        searchPlaceholder="Search by place or notes"
        server={{
          total: count,
          page,
          pageSize: PAGE_SIZE,
          onPageChange: setPage,
          onSearchChange: setSearch,
          onFilterChange: (key, value) => {
            setPage(0);
            if (key === "status") setStatusFilter(value);
          },
        }}
        emptyMessage="No stock moved yet."
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "sent", label: "Not received yet" },
              { value: "received", label: "Received" },
              { value: "cancelled", label: "Cancelled" },
            ],
          },
        ]}
        rowActions={(t) => (
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/inventory/transfers/${t.id}`}>
              <EyeIcon />
              View
            </Link>
          </Button>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From</Label>
                <select
                  className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 w-full"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}>
                  <option value="">—</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <select
                  className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 w-full"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}>
                  <option value="">—</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Items</Label>
              {lines.map((line, idx) => {
                const lineItem = items.find((i) => i.id === line.inventory_item_id);
                const link = lineItem?.transfer_link;
                const linkFactor = Math.max(1, Number(link?.conversion_factor) || 1);
                const received = (Number(line.quantity) || 0) * linkFactor;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex gap-2">
                      <select
                        className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 flex-1"
                        value={line.inventory_item_id}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx].inventory_item_id = e.target.value;
                          setLines(next);
                        }}>
                        <option value="">Pick an item</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>{i.name}</option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        className="w-24"
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx].quantity = e.target.value;
                          setLines(next);
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setLines(lines.filter((_, i) => i !== idx))}>
                        <XIcon />
                      </Button>
                    </div>
                    {link && (
                      <p className="text-xs text-primary">
                        Pack — the other place gets{" "}
                        <strong>{link.target_item_name ?? "linked item"}</strong>
                        {received > 0 ? <> (+{received})</> : <> (×{linkFactor})</>}
                      </p>
                    )}
                  </div>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLines([...lines, { inventory_item_id: "", quantity: "" }])}>
                <PlusIcon />
                Add item
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>Move stock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
