import React from 'react';
import { Search, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PaymentFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filterStatus: string;
  setFilterStatus: (status: string) => void;
  filterMethod: string;
  setFilterMethod: (method: string) => void;
  filterDate: string;
  setFilterDate: (date: string) => void;
  // Custom range bounds (YYYY-MM-DD), only used when filterDate === 'custom'.
  customFrom: string;
  setCustomFrom: (date: string) => void;
  customTo: string;
  setCustomTo: (date: string) => void;
  // Days of history this role may see (null = unlimited). Drives which day
  // options are offered and the "All" label.
  lookbackDays?: number | null;
  // Earliest day this role may view (YYYY-MM-DD); null = unlimited. Clamps the
  // custom date pickers so a restricted role can't pick past its window.
  floorDate?: string | null;
  paymentMethods: any[];
}

const statusOptions = [
  { id: 'all', label: 'All statuses' },
  { id: 'pending', label: 'Pending' },
  { id: 'paid', label: 'Paid' },
  { id: 'failed', label: 'Failed' },
  { id: 'refunded', label: 'Refunded' },
  { id: 'deleted', label: 'Deleted' }
];

export const PaymentFilters: React.FC<PaymentFiltersProps> = ({
  searchTerm,
  setSearchTerm,
  filterStatus,
  setFilterStatus,
  filterMethod,
  setFilterMethod,
  filterDate,
  setFilterDate,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  lookbackDays,
  floorDate,
  paymentMethods
}) => {
  const clearSearch = () => setSearchTerm('');

  // Any past-day option only makes sense when the role can look back at least
  // one day. Unlimited (null) or >= 1 day allows it; a 0-day (today-only) role
  // doesn't.
  const allowPast = lookbackDays == null || lookbackDays >= 1;
  const dateOptions = [
    { id: 'all', label: lookbackDays == null ? 'All dates' : 'All visible' },
    { id: 'today', label: 'Today' },
    ...(allowPast
      ? [
          { id: 'yesterday', label: 'Yesterday' },
          { id: 'week', label: 'This week' },
          { id: 'month', label: 'This month' },
          { id: 'custom', label: 'Custom range' }
        ]
      : [])
  ];

  // Today (YYYY-MM-DD, local) caps the custom pickers so no future date is picked.
  const today = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();

  const resetFilters = () => {
    setFilterStatus('all');
    setFilterMethod('all');
    setFilterDate('all');
    setCustomFrom('');
    setCustomTo('');
    setSearchTerm('');
  };

  const paymentMethodOptions = [
    { id: 'all', label: 'All methods' },
    ...paymentMethods.map((pm) => ({
      id: pm.name,
      label: pm.display_name || pm.name
    }))
  ];

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search payments..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={filterDate} onValueChange={setFilterDate}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="All dates" />
            </SelectTrigger>
            <SelectContent>
              {dateOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterMethod} onValueChange={setFilterMethod}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="All methods" />
            </SelectTrigger>
            <SelectContent>
              {paymentMethodOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={resetFilters}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset
          </button>
        </div>

        {filterDate === 'custom' && (
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Input
                type="date"
                value={customFrom}
                min={floorDate ?? undefined}
                max={customTo || today}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full sm:w-44"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Input
                type="date"
                value={customTo}
                min={customFrom || floorDate || undefined}
                max={today}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full sm:w-44"
              />
            </div>
            {(customFrom || customTo) && (
              <button
                type="button"
                onClick={() => {
                  setCustomFrom('');
                  setCustomTo('');
                }}
                className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PaymentFilters;
