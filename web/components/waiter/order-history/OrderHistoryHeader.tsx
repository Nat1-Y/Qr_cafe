import React from "react";
import { Plus, LogOut } from "lucide-react";
import BranchBadge from "@/components/waiter/BranchBadge";
import { Button } from "@/components/ui/button";

interface OrderHistoryHeaderProps {
  totalOrdersCount: number;
  onNewOrder: () => void;
  onLogout: () => void;
}

export const OrderHistoryHeader: React.FC<OrderHistoryHeaderProps> = ({
  totalOrdersCount,
  onNewOrder,
  onLogout,
}) => {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-foreground sm:text-title">
          My orders
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            {totalOrdersCount} {totalOrdersCount === 1 ? "order" : "orders"} taken by you
          </span>
          <BranchBadge />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="lg" className="h-12" onClick={onNewOrder}>
          <Plus />
          New order
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-12 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
          onClick={onLogout}
          aria-label="Sign out"
          title="Sign out">
          <LogOut className="size-5" />
        </Button>
      </div>
    </div>
  );
};

export default OrderHistoryHeader;
