import React from 'react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  /** Accepted for compatibility; KPI cards deliberately show no icon. */
  icon?: React.ReactNode;
  trend?: {
    value: number;
    label?: string;
  };
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'info';
  className?: string;
}

// Olive only when the number means good or available.
const VALUE_TONE: Record<NonNullable<StatsCardProps['variant']>, string> = {
  default: 'text-foreground',
  info: 'text-foreground',
  success: 'text-accent',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

/** KPI card: small muted label, big number. */
const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  subtitle,
  variant = 'default',
  className,
}) => {
  return (
    <div className={cn('min-w-0 rounded-card border border-border bg-card px-5 py-4', className)}>
      <p className="truncate text-meta text-muted-foreground">{title}</p>
      <p className={cn('mt-1 text-kpi leading-tight break-words', VALUE_TONE[variant])}>{value}</p>
      {subtitle && <p className="mt-0.5 truncate text-meta text-muted-foreground">{subtitle}</p>}
    </div>
  );
};

export default StatsCard;
