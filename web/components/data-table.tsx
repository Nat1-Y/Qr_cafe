"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateFilterBar, type DateRange } from "@/components/date-filter-bar";

export type Column<T> = {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  /** Override the text used when matching this column against the search query. */
  searchValue?: (row: T) => string;
  /** Make this column sortable by clicking its header. */
  sortable?: boolean;
  /** Value used when sorting this column. Defaults to row[key]. */
  sortValue?: (row: T) => number | string | Date | null | undefined;
};

export type SortState = { key: string; dir: "asc" | "desc" };

export type DataTableFilter<T> = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** Custom predicate; defaults to String(row[key]) === value. */
  match?: (row: T, value: string) => boolean;
};

export type DateRangeFilter<T> = {
  key: string;
  label: string;
  /** Returns the row's date (ISO string / Date / null) to compare against the range. */
  getDate: (row: T) => string | Date | null | undefined;
};

/**
 * Opt-in row selection: a leading checkbox column plus a header "select all"
 * checkbox. "Select all" only ever touches rows currently matching the
 * table's search/filter/date-range state (i.e. `sorted`, computed below) —
 * never rows hidden by a filter — and skips anything `isSelectable` rejects
 * (e.g. a row with nothing left to action on).
 */
export type RowSelection<T> = {
  selectedKeys: Set<string>;
  onSelectionChange: (keys: Set<string>) => void;
  /** Row is excluded from its own checkbox and from "select all" when this returns false. */
  isSelectable?: (row: T) => boolean;
  /** Accessible label for the select-all checkbox. Defaults to "Select all". */
  label?: string;
};

function idKeyOf<T>(row: T): string {
  return String((row as { id?: string | number })?.id ?? "");
}

/**
 * When provided, the table stops filtering/paginating in the browser and instead
 * reports query/filter/range/page changes back to the parent, which is expected
 * to refetch the matching page from the server. `rows` then holds only the
 * current page and `total` the full server-side count.
 */
export type ServerMode = {
  total: number;
  /** 0-based current page. */
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onSearchChange?: (query: string) => void;
  onFilterChange?: (key: string, value: string) => void;
  onRangeChange?: (key: string, range: { from?: string; to?: string }) => void;
  /** Opt into server-side sorting. Called with null when sorting is cleared. */
  onSortChange?: (sort: SortState | null) => void;
};

function textOf<T>(row: T, col: Column<T> | undefined, key: string): string {
  if (col?.searchValue) return col.searchValue(row);
  return String((row as Record<string, unknown>)[key] ?? "");
}

function sortValueOf<T>(
  row: T,
  col: Column<T> | undefined,
  key: string,
): number | string | Date | null | undefined {
  if (col?.sortValue) return col.sortValue(row);
  return (row as Record<string, unknown>)[key] as
    | number
    | string
    | Date
    | null
    | undefined;
}

/** Compare two sort values: numbers numerically, dates by time, otherwise as
 * natural-ordered strings. Null/undefined always sort last. */
function compareValues(
  a: number | string | Date | null | undefined,
  b: number | string | Date | null | undefined,
): number {
  const aEmpty = a == null || a === "";
  const bEmpty = b == null || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a instanceof Date || b instanceof Date)
    return new Date(a).getTime() - new Date(b).getTime();
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export function DataTable<T>({
  columns,
  rows,
  loading = false,
  getRowKey,
  searchPlaceholder = "Search…",
  searchKeys,
  filters,
  dateFilters,
  pageSize = 10,
  emptyMessage = "Nothing here yet.",
  rowActions,
  toolbar,
  server,
  selection,
  onVisibleRowsChange,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  getRowKey?: (row: T, index: number) => string | number;
  searchPlaceholder?: string;
  /** Column keys to search across. Defaults to every column key. */
  searchKeys?: string[];
  filters?: DataTableFilter<T>[];
  dateFilters?: DateRangeFilter<T>[];
  pageSize?: number;
  emptyMessage?: string;
  rowActions?: (row: T) => React.ReactNode;
  /** Extra controls rendered on the right side of the toolbar. */
  toolbar?: React.ReactNode;
  /** Opt into server-driven search / filtering / pagination. */
  server?: ServerMode;
  /** Opt into a leading checkbox column + filter-scoped "select all". */
  selection?: RowSelection<T>;
  /**
   * Reports every row currently matching search/filters/date-range (all
   * pages, pre-sort) whenever it changes — lets a parent compute stats (e.g.
   * totals) that track the table's active filters instead of the full,
   * unfiltered `rows`.
   */
  onVisibleRowsChange?: (rows: T[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Record<string, string>>({});
  const [ranges, setRanges] = useState<Record<string, DateRange>>({});
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    // In server mode the parent already returns the matching page; don't filter.
    if (server) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      for (const f of filters ?? []) {
        const val = active[f.key];
        if (!val) continue;
        const ok = f.match
          ? f.match(row, val)
          : String((row as Record<string, unknown>)[f.key] ?? "") === val;
        if (!ok) return false;
      }
      for (const f of dateFilters ?? []) {
        const range = ranges[f.key];
        if (!range?.from && !range?.to) continue;
        const raw = f.getDate(row);
        if (!raw) return false;
        const t = new Date(raw).getTime();
        if (Number.isNaN(t)) return false;
        if (range.from && t < new Date(`${range.from}T00:00:00`).getTime()) return false;
        if (range.to && t > new Date(`${range.to}T23:59:59.999`).getTime()) return false;
      }
      if (!q) return true;
      const keys = searchKeys ?? columns.map((c) => c.key);
      return keys.some((k) => {
        const col = columns.find((c) => c.key === k);
        return textOf(row, col, k).toLowerCase().includes(q);
      });
    });
  }, [server, rows, query, active, ranges, filters, dateFilters, searchKeys, columns]);

  useEffect(() => {
    onVisibleRowsChange?.(filtered);
  }, [filtered, onVisibleRowsChange]);

  const sorted = useMemo(() => {
    // In server mode the parent returns rows already sorted by the backend.
    if (server || !sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort(
      (a, b) =>
        factor *
        compareValues(
          sortValueOf(a, col, sort.key),
          sortValueOf(b, col, sort.key),
        ),
    );
  }, [server, filtered, sort, columns]);

  const effPageSize = server ? server.pageSize : pageSize;
  const totalCount = server ? server.total : sorted.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / effPageSize));
  const current = server ? server.page : Math.min(page, pageCount - 1);
  // Server mode already hands us just the current page; client mode slices.
  const paged = server
    ? sorted
    : sorted.slice(current * pageSize, current * pageSize + pageSize);
  const colSpan = columns.length + (rowActions ? 1 : 0) + (selection ? 1 : 0);

  // Scoped to `sorted` — every row matching the current search/filter/date
  // range, across all pages — not just `rows` (would ignore active filters)
  // and not just `paged` (would silently drop the other pages). In server
  // mode `sorted` only ever holds the current page, so "select all" there
  // is necessarily page-scoped too.
  const selectableRows = selection
    ? sorted.filter((r) => !selection.isSelectable || selection.isSelectable(r))
    : [];
  const selectableKeys = selectableRows.map(idKeyOf);
  const allSelected =
    !!selection && selectableKeys.length > 0 && selectableKeys.every((k) => selection.selectedKeys.has(k));
  const someSelected = !!selection && selectableKeys.some((k) => selection.selectedKeys.has(k));

  function toggleSelectAll() {
    if (!selection) return;
    const next = new Set(selection.selectedKeys);
    if (allSelected) selectableKeys.forEach((k) => next.delete(k));
    else selectableKeys.forEach((k) => next.add(k));
    selection.onSelectionChange(next);
  }

  function toggleRow(row: T) {
    if (!selection) return;
    const key = idKeyOf(row);
    const next = new Set(selection.selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selection.onSelectionChange(next);
  }

  function goToPage(p: number) {
    if (server) server.onPageChange(p);
    else setPage(p);
  }
  function onQuery(v: string) {
    setQuery(v);
    setPage(0);
    server?.onSearchChange?.(v);
  }
  function onFilter(key: string, v: string) {
    setActive((prev) => ({ ...prev, [key]: v }));
    setPage(0);
    server?.onFilterChange?.(key, v);
  }
  function onDateFilterChange(key: string, range: DateRange) {
    setRanges((prev) => ({ ...prev, [key]: range }));
    setPage(0);
    server?.onRangeChange?.(key, range);
  }
  function toggleSort(key: string) {
    // Cycle through: ascending → descending → unsorted.
    const next: SortState | null =
      sort?.key !== key
        ? { key, dir: "asc" }
        : sort.dir === "asc"
          ? { key, dir: "desc" }
          : null;
    setSort(next);
    setPage(0);
    server?.onSortChange?.(next);
  }
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={searchPlaceholder}
            wrapperClassName="sm:max-w-xs"
          />

          {filters?.map((f) => (
            <select
              key={f.key}
              className="h-10 rounded-full border border-input bg-card px-4 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring"
              value={active[f.key] ?? ""}
              onChange={(e) => onFilter(f.key, e.target.value)}>
              <option value="">{f.label}: All</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}

          {dateFilters?.map((f) => (
            <DateFilterBar
              key={f.key}
              defaultPreset="all"
              allLabel={server ? "Last 30 days" : "All time"}
              viewingPrefix={`${f.label}:`}
              onChange={(range) => onDateFilterChange(f.key, range)}
            />
          ))}

          {toolbar && <div className="sm:ml-auto">{toolbar}</div>}
        </div>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {selection && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleSelectAll}
                    disabled={selectableKeys.length === 0}
                    aria-label={selection.label ?? "Select all"}
                  />
                </TableHead>
              )}
              {columns.map((c) => (
                <TableHead key={c.key} className={c.className}>
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className="-ml-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
                      aria-label={`Sort by ${c.label}`}>
                      {c.label}
                      {sort?.key === c.key ? (
                        sort.dir === "asc" ? (
                          <ArrowUpIcon className="size-3.5" />
                        ) : (
                          <ArrowDownIcon className="size-3.5" />
                        )
                      ) : (
                        <ChevronsUpDownIcon className="size-3.5 text-muted-foreground/60" />
                      )}
                    </button>
                  ) : (
                    c.label
                  )}
                </TableHead>
              ))}
              {rowActions && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={colSpan}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colSpan}
                  className="py-12 text-center text-sm text-muted-foreground">
                  {filtered.length === 0 && rows.length > 0
                    ? "Nothing matches. Try other filters."
                    : emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paged.map((row, i) => (
                <TableRow key={getRowKey?.(row, i) ?? (row as { id?: string }).id ?? i}>
                  {selection && (
                    <TableCell className="w-10">
                      <Checkbox
                        checked={selection.selectedKeys.has(idKeyOf(row))}
                        onCheckedChange={() => toggleRow(row)}
                        disabled={selection.isSelectable ? !selection.isSelectable(row) : false}
                        aria-label="Select row"
                      />
                    </TableCell>
                  )}
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>
                      {c.render
                        ? c.render(row)
                        : ((row as Record<string, unknown>)[c.key] as React.ReactNode) ??
                          "—"}
                    </TableCell>
                  ))}
                  {rowActions && (
                    <TableCell className="text-right">{rowActions(row)}</TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      {!loading && totalCount > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-meta text-muted-foreground">
          <span>
            Showing {current * effPageSize + 1}–
            {Math.min(totalCount, current * effPageSize + paged.length)} of{" "}
            {totalCount}
          </span>
          <div className="flex items-center gap-2">
            <span>
              Page {current + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={current === 0}
              onClick={() => goToPage(current - 1)}>
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={current >= pageCount - 1}
              onClick={() => goToPage(current + 1)}>
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
