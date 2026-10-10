import React from "react";
import { CoffeeIcon, HouseIcon, ListIcon, LogOutIcon } from "lucide-react";
import BranchBadge from "@/components/waiter/BranchBadge";
import { Button } from "@/components/ui/button";

interface WaiterHeaderProps {
  onLogout: () => void;
  onNavigateToHistory: () => void;
  onNavigateToDashboard: () => void;
}

/** Slim header row for the waiter's order screen. Touch targets are 48px. */
export const WaiterHeader: React.FC<WaiterHeaderProps> = ({
  onLogout,
  onNavigateToHistory,
  onNavigateToDashboard,
}) => {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border bg-background px-4 py-2 sm:px-6">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-highlight text-highlight-foreground">
        <CoffeeIcon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-section text-foreground">New order</h1>
        <BranchBadge />
      </div>
      <nav className="flex items-center gap-1">
        <Button variant="ghost" size="icon-lg" onClick={onNavigateToHistory} aria-label="Order history" title="Order history">
          <ListIcon className="size-5" />
        </Button>
        <Button variant="ghost" size="icon-lg" onClick={onNavigateToDashboard} aria-label="Dashboard" title="Dashboard">
          <HouseIcon className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={onLogout}
          aria-label="Sign out"
          title="Sign out"
          className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive">
          <LogOutIcon className="size-5" />
        </Button>
      </nav>
    </header>
  );
};

export default WaiterHeader;
