import React from 'react';
import { ArrowLeftIcon, HouseIcon } from 'lucide-react';
import BranchBadge from '../../../../components/common/BranchBadge';
import { Card, CardContent } from '@/components/ui/card';

interface CreateOrderHeaderProps {
  waiterName: string;
  deliveryMode?: boolean;
  isOnline: boolean;
  onNavigateToWaiters: () => void;
  onNavigateToDashboard: () => void;
}

const CreateOrderHeader: React.FC<CreateOrderHeaderProps> = ({
  waiterName,
  deliveryMode = false,
  isOnline,
  onNavigateToWaiters,
  onNavigateToDashboard
}) => {
  return (
    <Card className="rounded-none border-b shadow-sm bg-card/70 backdrop-blur-md sticky top-0 z-50 transition-all mb-6">
      <CardContent className="py-3 px-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="/assets/logo.png?v=8"
            alt="Logo"
            className="w-9 h-9 object-contain bg-background rounded-lg p-0.5 shadow-sm"
          />
          <div>
            <h1 className="text-sm font-extrabold text-foreground tracking-wide">Create Order</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <BranchBadge />
              {!isOnline && (
                <span className="px-2 py-0.5 text-[9px] font-extrabold bg-destructive/15 text-destructive rounded-lg border border-destructive/30 shadow-sm animate-pulse">
                  OFFLINE MODE
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-4">
          <div
            className={`hidden sm:flex items-center px-4 py-1.5 rounded-full border shadow-inner ${
              deliveryMode
                ? 'bg-sky-500/10 border-sky-300'
                : 'bg-muted/30 border-border/50'
            }`}
          >
            <span className="text-sm font-medium text-muted-foreground mr-2">
              {deliveryMode ? 'Order type:' : 'Waiter:'}
            </span>
            <span className={`text-sm font-bold ${deliveryMode ? 'text-sky-700' : 'text-foreground'}`}>
              {waiterName}
            </span>
          </div>

          <button
            onClick={onNavigateToWaiters}
            className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm font-semibold text-info hover:bg-info/10 rounded-xl transition-colors duration-200 hover:shadow-sm"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="hidden sm:inline">{deliveryMode ? 'Change' : 'Change Waiter'}</span>
          </button>

          <button
            onClick={onNavigateToDashboard}
            className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm font-semibold text-foreground/80 hover:bg-muted rounded-xl transition-colors duration-200 hover:shadow-sm"
          >
            <HouseIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
};

export default CreateOrderHeader;
