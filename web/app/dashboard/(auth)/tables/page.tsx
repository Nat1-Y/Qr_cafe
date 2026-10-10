"use client";

import { ResourceManager, type Column } from "@/components/resource-manager";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tables } from "@/lib/resources";
import { cn } from "@/lib/utils";

type T = { id: string; table_number: number; status: string };

const columns: Column<T>[] = [
  {
    key: "table_number",
    label: "Table",
    render: (r) => <span className="font-semibold text-foreground">Table {r.table_number}</span>,
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
            <span className="text-kpi leading-none text-foreground">{t.table_number}</span>
            <span className={cn("text-sm font-semibold", occupied ? "text-highlight-foreground" : "text-accent")}>
              {occupied ? "Occupied" : "Free"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function TablesPage() {
  return (
    <ResourceManager<T>
      title="Tables"
      description="Dining tables for this branch."
      createLabel="New table"
      columns={columns}
      fields={[{ key: "table_number", label: "Table number", type: "number", required: true }]}
      load={Tables.list}
      create={Tables.create}
      remove={Tables.remove}
      stats={(rows, loading) => <FloorTiles rows={rows} loading={loading} />}
    />
  );
}
