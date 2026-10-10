"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useMemo, useState } from "react";
import { X, MapPin, ChevronDown, PackageX } from "lucide-react";
import { SearchInput } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OrderFiltersPanelProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  allTables: any[];
  selectedTable: string;
  onSelectTable: (table: string) => void;
  // Owner-configured delivery channels this waiter is allowed to use. The
  // dropdown only renders when both are non-empty.
  deliveryMethods?: Array<{ id: string; display_name: string; icon?: string | null }>;
  selectedDeliveryMethodId?: string;
  onSelectDeliveryMethod?: (id: string) => void;
  selectedMainCategory: string;
  onSelectMainCategory: (cat: string) => void;
  mainCategories: { id: string; label: string; count: number }[];
  totalItemsCount: number;
  selectedSubCategory: string;
  onSelectSubCategory: (cat: string) => void;
  subCategories: { id: string; label: string; count: number }[];
  totalSubItemsCount: number;
  showSubCategories: boolean;
  forceTableSelection?: boolean;
  // Out-of-stock filter (only rendered when the owner toggle is on and at least
  // one item is out of stock).
  showStockFilter?: boolean;
  stockFilterActive?: boolean;
  onToggleStockFilter?: () => void;
  outOfStockCount?: number;
}

const OrderFiltersPanel: React.FC<OrderFiltersPanelProps> = ({
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search menu items, categories, or sub-items...",
  allTables,
  selectedTable,
  onSelectTable,
  deliveryMethods = [],
  selectedDeliveryMethodId = "",
  onSelectDeliveryMethod,
  selectedMainCategory,
  onSelectMainCategory,
  mainCategories,
  totalItemsCount,
  selectedSubCategory,
  onSelectSubCategory,
  subCategories,
  totalSubItemsCount,
  showSubCategories,
  showStockFilter = false,
  stockFilterActive = false,
  onToggleStockFilter,
  outOfStockCount = 0,
}) => {
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [mainCategoryMenuOpen, setMainCategoryMenuOpen] = useState(false);
  const [subCategoryMenuOpen, setSubCategoryMenuOpen] = useState(false);

  const mainCategoryOptions = useMemo(
    () => [
      { id: "all", label: "All categories", count: totalItemsCount },
      ...mainCategories,
    ],
    [mainCategories, totalItemsCount],
  );

  const subCategoryOptions = useMemo(
    () =>
      !showSubCategories
        ? []
        : [
            { id: "all", label: "All sub-items", count: totalSubItemsCount },
            ...subCategories,
          ],
    [showSubCategories, subCategories, totalSubItemsCount],
  );

  const clearSearch = () => onSearchChange("");

  const tableTriggerLabel =
    selectedTable && selectedTable !== "takeaway" ? `Table ${selectedTable}` : "Pick table";

  const handleSelectTable = (value: string) => {
    onSelectTable(value);
    setTableMenuOpen(false);
  };
  const handleSelectMainCategory = (value: string) => {
    onSelectMainCategory(value);
    setMainCategoryMenuOpen(false);
  };
  const handleSelectSubCategory = (value: string) => {
    onSelectSubCategory(value);
    setSubCategoryMenuOpen(false);
  };

  const selectedMainOption =
    mainCategoryOptions.find((c) => c.id === selectedMainCategory) ??
    mainCategoryOptions[0];
  const selectedSubOption =
    subCategoryOptions.find((c) => c.id === selectedSubCategory) ??
    subCategoryOptions[0];

  const formatTriggerLabel = (
    option: { label: string; count?: number } | undefined,
    fallback: string,
  ) => {
    if (!option) return fallback;
    const countSuffix =
      typeof option.count === "number" ? ` · ${option.count}` : "";
    return `${option.label}${countSuffix}`;
  };

  // Touch-first: every control is at least 48px tall.
  const pill =
    "inline-flex h-12 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors outline-none hover:bg-row-hover focus-visible:ring-4 focus-visible:ring-ring";
  const pillOn = "border-[1.5px] border-primary text-primary";
  const tile =
    "flex items-center justify-center rounded-xl border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-row-hover";
  const tileOn = "border-[1.5px] border-primary text-primary";

  return (
    <div className="shrink-0 space-y-2">
      <div className="relative">
        <SearchInput
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-12 pr-12"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <button
          type="button"
          aria-pressed={selectedTable === "takeaway"}
          onClick={() => handleSelectTable(selectedTable === "takeaway" ? "" : "takeaway")}
          className={cn(pill, selectedTable === "takeaway" && pillOn)}>
          Takeaway
        </button>

        {allTables?.length > 0 && (
          <DropdownMenu open={tableMenuOpen} onOpenChange={setTableMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(pill, "min-w-[140px] justify-between", selectedTable && selectedTable !== "takeaway" && pillOn)}>
                <span className="flex items-center gap-1.5 truncate">
                  <MapPin className="size-4 shrink-0" />
                  <span className="truncate">{tableTriggerLabel}</span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[calc(100vw-2rem)] max-w-xs p-0 sm:w-72">
              <div className="px-4 pt-4">
                <p className="text-sm font-semibold text-foreground">Tables</p>
                <p className="text-meta text-muted-foreground">Tap the table this order is for.</p>
              </div>
              <div className="mt-3 px-4 pb-4">
                <ScrollArea className="max-h-64 overflow-auto">
                  <div className="grid grid-cols-4 gap-2">
                    {allTables.map((table) => {
                      const value = String(table.number);
                      const isSelected = selectedTable === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => handleSelectTable(value)}
                          className={cn(tile, "h-14 text-base", isSelected && tileOn)}>
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {deliveryMethods.length > 0 && (
          <select
            value={selectedDeliveryMethodId}
            onChange={(e) => onSelectDeliveryMethod?.(e.target.value)}
            aria-label="Delivery method"
            className={cn(pill, "appearance-none", selectedDeliveryMethodId && pillOn)}>
            <option value="">Delivery…</option>
            {deliveryMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        )}

        <DropdownMenu open={mainCategoryMenuOpen} onOpenChange={setMainCategoryMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(pill, "min-w-[160px] justify-between", selectedMainCategory !== "all" && pillOn)}>
              <span className="truncate">{formatTriggerLabel(selectedMainOption, "All categories")}</span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[calc(100vw-2rem)] max-w-sm p-0 sm:w-[22rem]">
            <div className="px-4 pt-4">
              <p className="text-sm font-semibold text-foreground">Categories</p>
              <p className="text-meta text-muted-foreground">Choose what shows in the menu.</p>
            </div>
            <div className="mt-3 px-4 pb-4">
              <ScrollArea className="max-h-64 overflow-auto">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {mainCategoryOptions.map((category) => {
                    const isSelected = selectedMainCategory === category.id;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => handleSelectMainCategory(category.id)}
                        className={cn(tile, "h-16 flex-col items-start justify-between px-3 py-2 text-left", isSelected && tileOn)}>
                        <span className="line-clamp-2 capitalize">{category.label}</span>
                        <span className="text-meta text-muted-foreground">{category.count}</span>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {showSubCategories ? (
          <DropdownMenu open={subCategoryMenuOpen} onOpenChange={setSubCategoryMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(pill, "min-w-[160px] justify-between", selectedSubCategory !== "all" && pillOn)}>
                <span className="truncate">{formatTriggerLabel(selectedSubOption, "All sub-items")}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[calc(100vw-2rem)] max-w-sm p-0 sm:w-[22rem]">
              <div className="px-4 pt-4">
                <p className="text-sm font-semibold text-foreground">Sub-categories</p>
                <p className="text-meta text-muted-foreground">Narrow down the fasting menu.</p>
              </div>
              <div className="mt-3 px-4 pb-4">
                <ScrollArea className="max-h-64 overflow-auto">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {subCategoryOptions.map((category) => {
                      const isSelected = selectedSubCategory === category.id;
                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => handleSelectSubCategory(category.id)}
                          className={cn(tile, "h-16 flex-col items-start justify-between px-3 py-2 text-left", isSelected && tileOn)}>
                          <span className="line-clamp-2 capitalize">{category.label}</span>
                          <span className="text-meta text-muted-foreground">{category.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {/* Out-of-stock quick filter */}
        {showStockFilter ? (
          <button
            type="button"
            onClick={onToggleStockFilter}
            aria-pressed={stockFilterActive}
            className={cn(pill, stockFilterActive && "border-[1.5px] border-destructive text-destructive")}>
            <PackageX className="size-4" />
            Out of stock
            <span className="rounded-full bg-destructive-soft px-1.5 text-eyebrow text-destructive">{outOfStockCount}</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => {
            handleSelectMainCategory("all");
            if (showSubCategories) handleSelectSubCategory("all");
            if (stockFilterActive) onToggleStockFilter?.();
          }}
          className="inline-flex h-12 shrink-0 items-center rounded-full px-4 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
          Reset
        </button>
      </div>
    </div>
  );
};

export default OrderFiltersPanel;
