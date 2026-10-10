import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusBadge from '@/components/common/StatusBadge';
import type { InventoryRow, StockLevelRow } from '@/types/display.types';

interface InventoryPanelProps {
  items: InventoryRow[];
  /** Short "running low" list for the overview's side column. */
  compact?: boolean;
}

// Total on-hand and minimum across locations, matching the inventory page.
function levels(item: InventoryRow) {
  const stockByLocation: StockLevelRow[] = Array.isArray(item?.stock_by_location) ? item.stock_by_location : [];
  const piecesPerUnit = Math.max(1, Number(item?.pieces_per_unit || 1) || 1);
  const totalQty = stockByLocation.length > 0
    ? stockByLocation.reduce((sum, s) => sum + Number(s?.quantity || 0), 0)
    : Number(item?.quantity || item?.store_quantity || 0) * piecesPerUnit;
  const minQuantity = Number(item?.min_quantity || 0);
  const minMode = String(item?.min_quantity_mode || 'global');
  const totalMinQty = minMode === 'per_location' && stockByLocation.length > 0
    ? stockByLocation.reduce((sum, s) => sum + Number(s?.min_quantity || 0), 0)
    : minQuantity;
  const isLow = totalMinQty > 0 && totalQty < totalMinQty;
  return { totalQty, totalMinQty, isLow };
}

export const InventoryPanel: React.FC<InventoryPanelProps> = ({ items, compact = false }) => {
  const navigate = useNavigate();
  const rows = items.map((item) => ({ item, ...levels(item) }));

  if (compact) {
    const low = rows.filter((r) => r.isLow).slice(0, 8);
    return (
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border">
          <CardTitle>Running low</CardTitle>
          <CardDescription>Below their minimum level.</CardDescription>
        </CardHeader>
        {low.length > 0 ? (
          <ul className="divide-y divide-border">
            {low.map(({ item, totalQty, totalMinQty }) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-6 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                  <p className="text-meta text-muted-foreground">
                    {totalQty} {item.unit} left · min {totalMinQty}
                  </p>
                </div>
                <StatusBadge kind="stock" status={totalQty <= 0 ? 'out' : 'low'} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">Everything is above its minimum.</p>
        )}
        <div className="border-t border-border px-6 py-3">
          <Button size="sm" variant="ghost" className="-ml-3" onClick={() => navigate('/dashboard/inventory')}>
            Open inventory
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 border-b border-border">
        <div>
          <CardTitle>Stock levels</CardTitle>
          <CardDescription>On hand against each item&apos;s minimum.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate('/dashboard/inventory')}>
          Manage inventory
        </Button>
      </CardHeader>
      {rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Minimum</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ item, totalQty, totalMinQty, isLow }) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                <TableCell className={isLow ? 'text-right font-semibold text-destructive' : 'text-right'}>{totalQty}</TableCell>
                <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                <TableCell className="text-right text-muted-foreground">{totalMinQty}</TableCell>
                <TableCell className="text-right">
                  <StatusBadge kind="stock" status={totalQty <= 0 && totalMinQty > 0 ? 'out' : isLow ? 'low' : 'ok'} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="px-6 py-12 text-center text-sm text-muted-foreground">No stock items yet.</p>
      )}
    </Card>
  );
};
