/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { PlusIcon } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { formatETB } from "@/lib/format";
import { cn } from "@/lib/utils";

interface MenuItemCardProps {
  item: any;
  onAddToCart: (item: any) => void;
  // Inventory-derived stock hint for this item, or undefined when the owner
  // toggle is off / the item has no recipe. Items stay orderable regardless.
  availability?: { status: "out" | "low" | "in_stock"; makeable: number };
}

/** Touch-first menu tile: name, price and a quick-add pill. The whole tile adds. */
const MenuItemCard: React.FC<MenuItemCardProps> = ({ item, onAddToCart, availability }) => {
  const isOut = availability?.status === "out";
  const isLow = availability?.status === "low";

  return (
    <button
      type="button"
      onClick={() => onAddToCart(item)}
      className="group flex min-h-[120px] flex-col justify-between gap-3 rounded-card border border-border bg-card p-4 text-left transition-colors outline-none hover:border-primary/40 hover:bg-row-hover focus-visible:ring-4 focus-visible:ring-ring active:bg-highlight/40">
      <span className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "line-clamp-2 text-base leading-snug font-medium text-foreground [overflow-wrap:anywhere]",
            isOut && "text-muted-foreground",
          )}>
          {item.name}
        </span>
        {/* A hint only: out-of-stock items stay orderable. */}
        {isOut ? (
          <StatusBadge kind="stock" status="out" className="shrink-0" />
        ) : isLow ? (
          <StatusBadge kind="stock" status="low" label={`${availability!.makeable} left`} className="shrink-0" />
        ) : null}
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{formatETB(item.price)}</span>
        <span className="inline-flex h-10 items-center gap-1 rounded-full bg-highlight px-3.5 text-sm font-semibold text-highlight-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <PlusIcon className="size-4" />
          Add
        </span>
      </span>
    </button>
  );
};

export default MenuItemCard;
