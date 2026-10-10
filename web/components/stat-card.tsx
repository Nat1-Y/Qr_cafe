import { cn } from "@/lib/utils";

type Variant = "default" | "success" | "info" | "warning" | "destructive";

// Olive only when the number means good or available.
const valueTone: Record<Variant, string> = {
  default: "text-foreground",
  info: "text-foreground",
  success: "text-accent",
  warning: "text-warning",
  destructive: "text-destructive",
};

/** KPI card: small muted label, big number. No icon badge. */
export function StatCard({
  title,
  value,
  subtitle,
  variant = "default",
  className,
}: {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  /** Accepted for compatibility; KPI cards deliberately show no icon. */
  icon?: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-card border border-border bg-card px-5 py-4", className)}>
      <p className="truncate text-meta text-muted-foreground">{title}</p>
      <p className={cn("mt-1 text-kpi leading-tight break-words", valueTone[variant])}>{value}</p>
      {subtitle && <p className="mt-0.5 truncate text-meta text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
