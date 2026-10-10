import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import { Table } from '../types';

interface TablesGridProps {
  loading: boolean;
  tables: Table[];
  onDelete: (table: Table) => void;
  onAddClick: () => void;
}

/**
 * Floor view: one tile per table. Free tables get an olive outline, occupied
 * ones a soft terracotta fill with the waiter's name.
 */
export const TablesGrid: React.FC<TablesGridProps> = ({
  loading,
  tables,
  onDelete,
  onAddClick,
}) => {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {[...Array(12)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-card" />)}
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <EmptyState
        className="rounded-card border border-dashed border-border"
        title="No tables yet"
        description="Add your first table to start taking orders by table."
        action={<Button onClick={onAddClick}><Plus />Add table</Button>}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
      {tables.map(table => {
        const occupied = table.status === 'occupied';
        return (
          <div
            key={table.id}
            className={cn(
              'relative flex min-h-32 flex-col justify-between rounded-card p-4',
              occupied
                ? 'border border-transparent bg-highlight/60'
                : 'border-[1.5px] border-accent bg-card'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-meta text-muted-foreground">Table</p>
                <p className="text-kpi leading-none text-foreground">{table.number}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="-mr-1.5 -mt-1.5 text-muted-foreground hover:bg-destructive-soft hover:text-destructive disabled:opacity-0"
                onClick={() => onDelete(table)}
                disabled={occupied}
                title={occupied ? 'Can’t delete a table that’s in use' : 'Delete table'}
                aria-label={`Delete table ${table.number}`}
              >
                <Trash2 />
              </Button>
            </div>
            <div className="mt-3">
              <p className={cn('text-sm font-semibold', occupied ? 'text-highlight-foreground' : 'text-accent')}>
                {occupied ? 'Occupied' : 'Free'}
              </p>
              <p className="truncate text-meta text-muted-foreground">
                {occupied && table.waiter_name ? table.waiter_name : `${table.capacity} seats`}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
export default TablesGrid;
