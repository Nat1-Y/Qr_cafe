import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { History, RefreshCw } from 'lucide-react';
import { InventoryMovement } from '../types';
import { humanize } from '@/lib/format';

interface MovementHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movements: InventoryMovement[];
  loading: boolean;
  itemName: string;
}

export const MovementHistoryDialog: React.FC<MovementHistoryDialogProps> = ({
  open,
  onOpenChange,
  movements,
  loading,
  itemName
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <span>Stock movement history</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Recent movements for <span className="font-semibold text-foreground">{itemName}</span>
          </DialogDescription>
        </DialogHeader>
        
        {loading ? (
          <div className="py-12 flex justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : movements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No movement history recorded for this item.
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden mt-2">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">After</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="max-w-[200px]">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => {
                  const isPositive = Number(m.quantity_delta || 0) > 0;
                  return (
                    <TableRow key={m.id} className="text-xs">
                      <TableCell className="whitespace-nowrap text-muted-foreground font-mono">
                        {m.created_at ? new Date(m.created_at).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {humanize(m.movement_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {m.location_name || `Location #${m.location_id}`}
                      </TableCell>
                      <TableCell className={`text-right font-semibold font-mono ${isPositive ? 'text-success' : 'text-destructive'}`}>
                        {isPositive ? '+' : ''}{m.quantity_delta}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground font-semibold">
                        {m.quantity_after}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-medium">
                        {m.user_name || 'System'}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate" title={m.notes || ''}>
                        {m.notes || '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close history</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MovementHistoryDialog;
