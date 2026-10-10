"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { humanize } from "@/lib/format";

export type DateFilterPreset = "all" | "today" | "week" | "month" | "custom";
export type DateFilterCustomMode = "specific" | "range";
export type DateRange = { from?: string; to?: string };

const ALL_PRESETS: DateFilterPreset[] = ["all", "today", "week", "month", "custom"];

const fmt = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const todayStr = () => fmt(new Date());

function rangeForPreset(preset: DateFilterPreset): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") return { from: fmt(today), to: fmt(today) };
  if (preset === "week") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from: fmt(from), to: fmt(today) };
  }
  if (preset === "month") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { from: fmt(from), to: fmt(today) };
  }
  return {};
}

/**
 * Today / Week / Month / Custom filter bar shared across the dashboard.
 * "Custom" reveals a Specific Date ↔ Date Range toggle, matching the
 * Foods & Drinks Sold page. Manages its own state and reports the resolved
 * {from, to} (yyyy-mm-dd, inclusive) up via onChange, including on mount.
 */
export function DateFilterBar({
  presets = ALL_PRESETS,
  defaultPreset = "all",
  onChange,
  allLabel = "All",
  viewingPrefix = "Showing:",
  showViewingBadge = true,
  className = "",
}: {
  presets?: DateFilterPreset[];
  defaultPreset?: DateFilterPreset;
  onChange: (range: DateRange, meta: { preset: DateFilterPreset; label: string }) => void;
  allLabel?: string;
  viewingPrefix?: string;
  showViewingBadge?: boolean;
  className?: string;
}) {
  const [preset, setPreset] = useState<DateFilterPreset>(defaultPreset);
  const [customMode, setCustomMode] = useState<DateFilterCustomMode>("specific");
  const today = useMemo(() => todayStr(), []);
  const [customDate, setCustomDate] = useState(today);
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);

  const range = useMemo<DateRange>(() => {
    if (preset !== "custom") return rangeForPreset(preset);
    return customMode === "specific"
      ? { from: customDate, to: customDate }
      : { from: customFrom, to: customTo };
  }, [preset, customMode, customDate, customFrom, customTo]);

  const label = useMemo(() => {
    if (preset === "all") return allLabel;
    if (preset === "today") return "Today";
    if (preset === "week") return "Week";
    if (preset === "month") return "Month";
    if (customMode === "specific") {
      return customDate ? new Date(customDate).toLocaleDateString() : "Custom";
    }
    return `${customFrom || "..."} to ${customTo || "..."}`;
  }, [preset, customMode, customDate, customFrom, customTo, allLabel]);

  useEffect(() => {
    onChange(range, { preset, label });
    // Only the resolved range should retrigger this — `onChange` is expected
    // to be a state setter (or equivalent) rather than a memoized callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, preset, label]);

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <Button
            key={p}
            type="button"
            variant={preset === p ? "selected" : "outline"}
            size="sm"
            onClick={() => setPreset(p)}>
            {p === "all" ? allLabel : humanize(p)}
          </Button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="mt-3 space-y-4 rounded-card border border-border bg-card p-4">
          <div className="grid max-w-xs grid-cols-2 gap-2">
            <Button
              type="button"
              variant={customMode === "specific" ? "selected" : "ghost"}
              size="sm"
              onClick={() => setCustomMode("specific")}>
              One day
            </Button>
            <Button
              type="button"
              variant={customMode === "range" ? "selected" : "ghost"}
              size="sm"
              onClick={() => setCustomMode("range")}>
              Date range
            </Button>
          </div>
          {customMode === "specific" ? (
            <Input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="max-w-xs"
            />
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="max-w-[12rem]"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="max-w-[12rem]"
              />
            </div>
          )}
          {showViewingBadge && (
            <Badge variant="muted">
              {viewingPrefix} {label}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
