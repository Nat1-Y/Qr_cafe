"use client";

import { useEffect, useState } from "react";
import { PrinterIcon, QrCodeIcon } from "lucide-react";
import { ResourceManager, type Column } from "@/components/resource-manager";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TableQrDialog } from "@/components/tables/TableQrDialog";
import { Tables, Users } from "@/lib/resources";
import type { QrTable } from "@/lib/qr";
import { cn } from "@/lib/utils";

type T = QrTable;

const columns: Column<T>[] = [
  {
    key: "table_number",
    label: "Table",
    render: (r) => <span className="font-semibold text-foreground">Table {r.table_number}</span>,
  },
  {
    key: "label",
    label: "Name on card",
    render: (r) => (r.label ? <span className="text-foreground">{r.label}</span> : <span className="text-muted-foreground">—</span>),
  },
  {
    key: "assigned_waiter_id",
    label: "Waiter",
    render: (r) =>
      r.assigned_waiter_name ? (
        <span className="text-foreground">{r.assigned_waiter_name}</span>
      ) : (
        <span className="text-muted-foreground">No waiter</span>
      ),
  },
  {
    key: "qr_enabled",
    label: "QR ordering",
    render: (r) => (r.qr_enabled ? <Badge variant="success">On</Badge> : <Badge variant="muted">Off</Badge>),
  },
  {
    key: "status",
    label: "Status",
    render: (r) => <StatusBadge kind="table" status={r.status} />,
  },
];

// Floor view: free tables outlined in olive, occupied ones in soft terracotta.
function FloorTiles({ rows, loading }: { rows: T[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-card" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) return null;
  const sorted = rows.slice().sort((a, b) => Number(a.table_number) - Number(b.table_number));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Each table has its own QR code. Guests scan it to order.</p>
        <Button variant="outline" asChild>
          <a href="/dashboard/print-cards" target="_blank" rel="noreferrer">
            <PrinterIcon /> Print all table cards
          </a>
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
        {sorted.map((t) => {
          const occupied = t.status === "occupied";
          return (
            <div
              key={t.id}
              className={cn(
                "flex min-h-24 flex-col justify-between rounded-card p-3",
                occupied ? "border border-transparent bg-highlight/60" : "border-[1.5px] border-accent bg-card",
              )}>
              <span className="flex items-start justify-between gap-1">
                <span className="text-kpi leading-none text-foreground">{t.table_number}</span>
                {!t.qr_enabled ? <QrCodeIcon className="size-4 text-muted-foreground opacity-50" aria-label="QR ordering off" /> : null}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-semibold", occupied ? "text-highlight-foreground" : "text-accent")}>
                  {occupied ? "Occupied" : "Free"}
                </span>
                <span className="block truncate text-meta text-muted-foreground">{t.assigned_waiter_name ?? "No waiter"}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface WaiterOption {
  id: string;
  name: string;
}

export default function TablesPage() {
  const [qrFor, setQrFor] = useState<T | null>(null);
  // Active waiters to assign to tables (QR orders go to the table's waiter).
  const [waiters, setWaiters] = useState<WaiterOption[]>([]);
  useEffect(() => {
    Users.waiters()
      .then((rows: Array<{ id: string; first_name?: string | null; last_name?: string | null; name?: string; username?: string }>) =>
        setWaiters(
          rows.map((u) => ({
            id: u.id,
            name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.name || u.username || "Waiter",
          })),
        ),
      )
      .catch(() => setWaiters([]));
  }, []);

  return (
    <ResourceManager<T>
      title="Tables"
      description="The tables at this branch, and the QR codes guests scan to order."
      createLabel="New table"
      columns={columns}
      fields={[
        { key: "table_number", label: "Table number", type: "number", required: true },
        { key: "label", label: "Name on card (optional)", type: "text" },
        {
          key: "assigned_waiter_id",
          label: "Waiter for this table",
          type: "select",
          options: waiters.map((w) => ({ value: w.id, label: w.name })),
        },
        { key: "qr_enabled", label: "Guests can order by QR", type: "switch", default: true },
      ]}
      load={Tables.list}
      create={Tables.create}
      update={Tables.update}
      remove={Tables.remove}
      rowActions={(row, reload) => (
        <>
          <Button variant="outline" size="sm" onClick={() => setQrFor(row)}>
            <QrCodeIcon /> QR code
          </Button>
          {qrFor?.id === row.id ? (
            <TableQrDialog
              table={qrFor}
              open
              onOpenChange={(o) => !o && setQrFor(null)}
              onChanged={async () => {
                await reload();
                const fresh = (await Tables.list()) as T[];
                setQrFor(fresh.find((t) => t.id === row.id) ?? null);
              }}
            />
          ) : null}
        </>
      )}
      stats={(rows, loading) => <FloorTiles rows={rows} loading={loading} />}
    />
  );
}
