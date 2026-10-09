import React from 'react';
import { PlusIcon } from 'lucide-react';
import { formatETB } from '@/lib/format';

interface MenuItemCardProps {
  item: any;
  onAddToCart: (item: any) => void;
}

/** Menu tile: name, price and a quick-add pill. The whole tile adds the item. */
const MenuItemCard: React.FC<MenuItemCardProps> = ({ item, onAddToCart }) => {
  return (
    <button
      type="button"
      onClick={() => onAddToCart(item)}
      className="group flex min-h-[112px] flex-col justify-between gap-3 rounded-card border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-row-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring active:bg-highlight/40"
    >
      <span className="line-clamp-2 text-base font-medium leading-snug text-foreground [overflow-wrap:anywhere]">
        {item.name}
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{formatETB(item.price)}</span>
        <span className="inline-flex h-9 items-center gap-1 rounded-full bg-highlight px-3 text-sm font-semibold text-highlight-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <PlusIcon className="h-4 w-4" />
          Add
        </span>
      </span>
    </button>
  );
};

// Memoized so the menu grid doesn't re-render every time the cart changes — with
// a stable `onAddToCart` and stable item objects, adding an item touches only the
// cart, not the grid (prevents the click-flicker).
export default React.memo(MenuItemCard);
