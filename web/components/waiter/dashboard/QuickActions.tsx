import React from "react";
import { ListIcon, PlusIcon, UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuickActionsProps {
  onNewOrder: () => void;
  onOrderHistory: () => void;
  /** Kept for compatibility; it opened the same screen as New order. */
  onViewMenu?: () => void;
  onMyProfile: () => void;
}

/** One big primary action, two quiet ones. 48px+ touch targets. */
const QuickActions: React.FC<QuickActionsProps> = ({ onNewOrder, onOrderHistory, onMyProfile }) => {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <Button size="charge" className="col-span-2 w-full sm:col-span-1" onClick={onNewOrder}>
        <PlusIcon className="size-5" />
        New order
      </Button>
      <Button variant="outline" size="charge" className="w-full text-sm" onClick={onOrderHistory}>
        <ListIcon />
        My orders
      </Button>
      <Button variant="outline" size="charge" className="w-full text-sm" onClick={onMyProfile}>
        <UserIcon />
        Profile
      </Button>
    </div>
  );
};

export default QuickActions;
