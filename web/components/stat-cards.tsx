import type { LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type StatCard = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  /** Accepted for compatibility; KPI cards deliberately show no icon. */
  icon?: LucideIcon;
  valueClass?: string;
};

// Shared KPI row used across dashboard pages (Dashboard, Orders, Payments):
// small muted label, big number, optional muted hint.
export function StatCards({
  cards,
  loading,
  className = "grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
}: {
  cards: StatCard[];
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      {cards.map((c) => (
        <div key={c.label} className="min-w-0 rounded-card border border-border bg-card px-5 py-4">
          <p className="truncate text-meta text-muted-foreground">{c.label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : (
            <>
              <p className={cn("mt-1 text-kpi leading-tight text-foreground break-words", c.valueClass)}>{c.value}</p>
              {c.hint && <p className="mt-0.5 truncate text-meta text-muted-foreground">{c.hint}</p>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
