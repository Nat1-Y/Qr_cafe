import React from 'react';
import { ArrowLeftIcon, HouseIcon } from 'lucide-react';
import BranchBadge from '../../../../components/common/BranchBadge';
import { Button } from '@/components/ui/button';

interface CreateOrderHeaderProps {
  waiterName: string;
  deliveryMode?: boolean;
  isOnline: boolean;
  onNavigateToWaiters: () => void;
  onNavigateToDashboard: () => void;
}

/** Slim header row for the order screen: back, who it's for, home. */
const CreateOrderHeader: React.FC<CreateOrderHeaderProps> = ({
  waiterName,
  deliveryMode = false,
  isOnline,
  onNavigateToWaiters,
  onNavigateToDashboard
}) => {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border bg-background px-4 py-3 sm:px-6">
      <Button variant="ghost" size="icon" onClick={onNavigateToWaiters} aria-label={deliveryMode ? 'Change order type' : 'Change waiter'}>
        <ArrowLeftIcon />
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="text-section text-foreground">New order</h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted-foreground">
          <span className="truncate">
            {deliveryMode ? 'Order type' : 'Waiter'}: <span className="font-medium text-foreground">{waiterName}</span>
          </span>
          <BranchBadge />
          {!isOnline && (
            <span className="rounded-full bg-destructive-soft px-2.5 py-0.5 text-eyebrow text-destructive">
              Offline
            </span>
          )}
        </div>
      </div>

      <Button variant="ghost" onClick={onNavigateToDashboard}>
        <HouseIcon />
        <span className="hidden sm:inline">Dashboard</span>
      </Button>
    </header>
  );
};

export default CreateOrderHeader;
