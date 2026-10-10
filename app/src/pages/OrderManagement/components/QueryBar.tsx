import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchInput } from '@/components/ui/input';
import { Filter } from 'lucide-react';
import { Label } from '@/components/ui/label';

interface QueryBarProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  filterStatus: string;
  onStatusChange: (status: string) => void;
  filterType: string;
  onTypeChange: (type: string) => void;
  userRole?: string;
  paidOrderIdSet: Set<string>;
  menuMainCategoryById: { [key: number]: string };
}

export const QueryBar: React.FC<QueryBarProps> = ({
  searchTerm,
  onSearchChange,
  filterStatus,
  onStatusChange,
  filterType,
  onTypeChange,
  userRole
}) => {
  const useDerivedStatus = userRole === 'admin' || userRole === 'cashier';

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Filters</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <Label className="mb-1.5 block">Search orders</Label>
          <SearchInput
              placeholder="Search by order number, table or waiter"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)} />
        </div>

        <div>
          <Label className="mb-1.5 block">Status</Label>
          <Select value={filterStatus} onValueChange={onStatusChange}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {useDerivedStatus ? (
                <>
                  <SelectItem value="pending">Waiting</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="voided">Cancelled</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="pending">Waiting</SelectItem>
                  <SelectItem value="preparing">Being made</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="completed">Done</SelectItem>
                  <SelectItem value="voided">Cancelled (after paying)</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="mb-1.5 block">Type</Label>
          <Select value={filterType} onValueChange={onTypeChange}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {!useDerivedStatus && <SelectItem value="bakery">Bakery</SelectItem>}
              <SelectItem value="cafe">Café</SelectItem>
              <SelectItem value="restaurant">Restaurant</SelectItem>
              <SelectItem value="barista">Barista</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
