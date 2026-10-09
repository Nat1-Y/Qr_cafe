import React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface DateFilterBarProps {
  statsRange: string;
  setStatsRange: (range: string) => void;
  customStatsDate: string;
  setCustomStatsDate: (date: string) => void;
}

const RANGES: Array<{ value: string; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
];

/** Segmented Today / Yesterday control for the KPI row. */
export const DateFilterBar: React.FC<DateFilterBarProps> = ({
  statsRange,
  setStatsRange,
  customStatsDate,
  setCustomStatsDate
}) => {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="tablist" className="inline-flex h-10 items-center gap-0.5 rounded-full border border-border bg-card p-1">
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            role="tab"
            aria-selected={statsRange === r.value}
            onClick={() => setStatsRange(r.value)}
            className={cn(
              'h-8 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring',
              statsRange === r.value
                ? 'bg-highlight text-highlight-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {statsRange === 'custom' && (
        <Input
          type="date"
          aria-label="Pick a date"
          value={customStatsDate}
          onChange={(e) => setCustomStatsDate(e.target.value)}
          className="w-44"
        />
      )}
    </div>
  );
};
