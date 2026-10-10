import React, { useMemo, useState } from 'react';
import { X, MapPin, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { SearchInput } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';

interface OrderFiltersPanelProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  allTables: any[];
  selectedTable: string;
  onSelectTable: (table: string) => void;
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
}

const OrderFiltersPanel: React.FC<OrderFiltersPanelProps> = ({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search the menu',
  allTables,
  selectedTable,
  onSelectTable,
  deliveryMethods = [],
  selectedDeliveryMethodId = '',
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
  forceTableSelection = false,
}) => {
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [mainCategoryMenuOpen, setMainCategoryMenuOpen] = useState(false);
  const [subCategoryMenuOpen, setSubCategoryMenuOpen] = useState(false);

  // Collapse the bulky table/category controls on short or small screens so the
  // menu list still gets vertical room. The search bar stays visible regardless.
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-height: 620px) and (min-width: 768px)').matches;
  });

  const activeFilterCount =
    (selectedTable ? 1 : 0) +
    (selectedMainCategory && selectedMainCategory !== 'all' ? 1 : 0) +
    (showSubCategories && selectedSubCategory && selectedSubCategory !== 'all' ? 1 : 0);

  const mainCategoryOptions = useMemo(
    () => [
      { id: 'all', label: 'All categories', count: totalItemsCount },
      ...mainCategories
    ],
    [mainCategories, totalItemsCount]
  );

  const subCategoryOptions = useMemo(
    () =>
      !showSubCategories
        ? []
        : [
          { id: 'all', label: 'All kinds', count: totalSubItemsCount },
          ...subCategories
        ],
    [showSubCategories, subCategories, totalSubItemsCount]
  );

  const clearSearch = () => onSearchChange('');

  const tableTriggerLabel =
    selectedTable === 'takeaway'
      ? 'Pick table'
        : selectedTable
          ? `Table ${selectedTable}`
          : 'Pick table';

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

  const selectedMainOption = mainCategoryOptions.find((c) => c.id === selectedMainCategory) ?? mainCategoryOptions[0];
  const selectedSubOption = subCategoryOptions.find((c) => c.id === selectedSubCategory) ?? subCategoryOptions[0];

  const formatTriggerLabel = (option: { label: string; count?: number } | undefined, fallback: string) => {
    if (!option) return fallback;
    const countSuffix = typeof option.count === 'number' ? ` · ${option.count}` : '';
    return `${option.label}${countSuffix}`;
  };

  const pill =
    'inline-flex h-12 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-row-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring';
  const pillOn = 'border-[1.5px] border-primary text-primary';
  const tile =
    'flex items-center justify-center rounded-xl border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-row-hover';
  const tileOn = 'border-[1.5px] border-primary text-primary';

  return (
    <div className="shrink-0 space-y-2">
      {/* Search + filters toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchInput
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pr-10"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setFiltersExpanded((v) => !v)}
          aria-expanded={filtersExpanded}
          className={cn(pill, filtersExpanded && pillOn)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 ? (
            <span className="rounded-full bg-highlight px-1.5 text-eyebrow text-highlight-foreground">{activeFilterCount}</span>
          ) : null}
        </button>
      </div>

      {filtersExpanded ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={selectedTable === 'takeaway'}
            onClick={() => handleSelectTable(selectedTable === 'takeaway' ? '' : 'takeaway')}
            className={cn(pill, selectedTable === 'takeaway' && pillOn)}
          >
            Takeaway
          </button>

          {allTables?.length > 0 && (
            <DropdownMenu open={tableMenuOpen} onOpenChange={setTableMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(pill, 'min-w-[140px] justify-between', selectedTable && selectedTable !== 'takeaway' && pillOn)}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="truncate">{tableTriggerLabel}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[calc(100vw-2rem)] max-w-xs p-0 sm:w-72">
                <div className="px-4 pt-4">
                  <p className="text-sm font-semibold text-foreground">Tables</p>
                  <p className="text-meta text-muted-foreground">Tap the table this order is for.</p>
                </div>
                <div className="mt-3 px-4 pb-4">
                  <ScrollArea className="max-h-56 overflow-auto">
                    <div className="grid grid-cols-4 gap-2">
                      {allTables.map((table) => {
                        const value = String(table.number);
                        const isSelected = selectedTable === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => handleSelectTable(value)}
                            className={cn(tile, 'h-14 text-base', isSelected && tileOn)}
                          >
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

          {selectedTable ? (
            <button
              type="button"
              onClick={() => handleSelectTable('')}
              className="inline-flex h-12 items-center rounded-full px-4 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Clear table
            </button>
          ) : null}

          {/* Delivery method — owner-configured; picking one stands in
              for a table. The cashier is never restricted (unlike the
              waiter's own web portal). */}
          {deliveryMethods.length > 0 && (
            <select
              value={selectedDeliveryMethodId}
              onChange={(e) => onSelectDeliveryMethod?.(e.target.value)}
              aria-label="Delivery method"
              className={cn(pill, 'appearance-none pr-4', selectedDeliveryMethodId && pillOn)}
            >
              <option value="">Delivery</option>
              {deliveryMethods.map((m) => (
                <option key={m.id} value={m.id}>{m.display_name}</option>
              ))}
            </select>
          )}

          <DropdownMenu open={mainCategoryMenuOpen} onOpenChange={setMainCategoryMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(pill, 'min-w-[160px] flex-1 justify-between sm:flex-none', selectedMainCategory !== 'all' && pillOn)}
              >
                <span className="truncate">{formatTriggerLabel(selectedMainOption, 'All categories')}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[calc(100vw-2rem)] max-w-sm p-0 sm:w-[22rem]">
              <div className="px-4 pt-4">
                <p className="text-sm font-semibold text-foreground">Categories</p>
                <p className="text-meta text-muted-foreground">Choose what shows in the menu.</p>
              </div>
              <div className="mt-3 px-4 pb-4">
                <ScrollArea className="max-h-60 overflow-auto">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {mainCategoryOptions.map((category) => {
                      const isSelected = selectedMainCategory === category.id;
                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => handleSelectMainCategory(category.id)}
                          className={cn(tile, 'h-16 flex-col items-start justify-between px-3 py-2 text-left', isSelected && tileOn)}
                        >
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
                  className={cn(pill, 'min-w-[160px] flex-1 justify-between sm:flex-none', selectedSubCategory !== 'all' && pillOn)}
                >
                  <span className="truncate">{formatTriggerLabel(selectedSubOption, 'All kinds')}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[calc(100vw-2rem)] max-w-sm p-0 sm:w-[22rem]">
                <div className="px-4 pt-4">
                  <p className="text-sm font-semibold text-foreground">Kinds</p>
                  <p className="text-meta text-muted-foreground">Pick a kind to see fewer items.</p>
                </div>
                <div className="mt-3 px-4 pb-4">
                  <ScrollArea className="max-h-60 overflow-auto">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {subCategoryOptions.map((category) => {
                        const isSelected = selectedSubCategory === category.id;
                        return (
                          <button
                            key={category.id}
                            type="button"
                            onClick={() => handleSelectSubCategory(category.id)}
                            className={cn(tile, 'h-16 flex-col items-start justify-between px-3 py-2 text-left', isSelected && tileOn)}
                          >
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

          <button
            type="button"
            onClick={() => {
              handleSelectMainCategory('all');
              if (showSubCategories) handleSelectSubCategory('all');
            }}
            className="inline-flex h-12 items-center rounded-full px-4 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Reset
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default OrderFiltersPanel;
