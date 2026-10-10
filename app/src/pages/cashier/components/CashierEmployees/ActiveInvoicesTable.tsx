import { formatOrderNumber } from "@/lib/utils";
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, X } from 'lucide-react';

interface TableSummary {
  table_number: string;
  count: number;
  total: number;
}

interface ActiveInvoicesTableProps {
  ordersForPaymentSorted: any[];
  selectedTable: string;
  setSelectedTable: (val: string) => void;
  tableSummaries: TableSummary[];
  getOrderItemsForRow: (order: any) => any[];
  loadingOrderIds: Set<string>;
  processingOrders: Set<string>;
  openProcessPaymentConfirm: (order: any) => void;
  formatCurrency: (val: any) => string;
  pendingSettleTotal: number;
  settlingAll: boolean;
  openSettleAllConfirm: () => void;
}

export const ActiveInvoicesTable: React.FC<ActiveInvoicesTableProps> = ({
  ordersForPaymentSorted,
  selectedTable,
  setSelectedTable,
  tableSummaries,
  getOrderItemsForRow,
  loadingOrderIds,
  processingOrders,
  openProcessPaymentConfirm,
  formatCurrency,
  pendingSettleTotal,
  settlingAll,
  openSettleAllConfirm
}) => {
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border">
        <div>
          <CardTitle>Waiting for payment</CardTitle>
          <CardDescription>This waiter's served orders.</CardDescription>
        </div>
        <span className="shrink-0 rounded-full bg-highlight px-2.5 py-0.5 text-eyebrow text-highlight-foreground">
          {ordersForPaymentSorted.length} {ordersForPaymentSorted.length === 1 ? 'order' : 'orders'}
        </span>
      </CardHeader>

      {tableSummaries.length > 0 && (
        <div className="flex items-center gap-2 px-6 pt-4">
          <Select
            value={selectedTable || 'all'}
            onValueChange={(v) => setSelectedTable(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="w-full rounded-full px-4 sm:w-56">
              <SelectValue placeholder="All tables" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tables</SelectItem>
              {tableSummaries.map((t) => (
                <SelectItem key={t.table_number} value={t.table_number}>
                  Table {t.table_number} ({t.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectedTable && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-border bg-highlight/30 px-6 py-4">
          <div>
            <p className="font-semibold text-foreground">Table {selectedTable}</p>
            <p className="text-meta text-muted-foreground">
              {ordersForPaymentSorted.length} {ordersForPaymentSorted.length === 1 ? 'order' : 'orders'} · {formatCurrency(pendingSettleTotal)} due
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={() => setSelectedTable('')} aria-label="Clear table filter">
              <X />
            </Button>
            <Button
              onClick={openSettleAllConfirm}
              disabled={settlingAll || ordersForPaymentSorted.length === 0}
            >
              {settlingAll ? <RefreshCw className="animate-spin" /> : null}
              Charge all for Table {selectedTable}
            </Button>
          </div>
        </div>
      )}

      {!selectedTable && ordersForPaymentSorted.length > 1 && (
        <div className="flex justify-end border-b border-border px-6 py-3">
          <Button onClick={openSettleAllConfirm} disabled={settlingAll}>
            {settlingAll ? <RefreshCw className="animate-spin" /> : null}
            Charge all {ordersForPaymentSorted.length} · {formatCurrency(pendingSettleTotal)}
          </Button>
        </div>
      )}
      <CardContent className="flex-1 overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordersForPaymentSorted.length > 0 ? (
              ordersForPaymentSorted.map((o) => {
                const isProcessing = processingOrders.has(o.id);
                return (
                  <TableRow key={o.id}>
                    <TableCell className="py-3.5 font-semibold text-foreground">
                      {formatOrderNumber(o)}
                    </TableCell>
                    <TableCell className="py-3.5 text-muted-foreground">
                      {o.order_type_label || (o.table_number ? `Table ${o.table_number}` : 'Takeaway')}
                    </TableCell>
                    <TableCell className="min-w-[200px] py-3.5">
                      {(() => {
                        const items = getOrderItemsForRow(o);
                        if (items.length > 0) {
                          return (
                            <div className="space-y-0.5 text-sm">
                              {items.map((item: any, idx: number) => (
                                <div key={idx} className="flex justify-between gap-3">
                                  <span className="text-body">
                                    <span className="text-muted-foreground">{item.quantity} ×</span>{' '}
                                    {item.menu_item_name || item.name || 'Item'}
                                  </span>
                                  <span className="shrink-0 text-muted-foreground">
                                    {formatCurrency(item.subtotal || item.total_price || 0)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        }

                        const id = o?.id != null ? o.id : null;
                        const isLoading =
                          id !== null && (id !== null && id !== undefined && id !== "")
                            ? loadingOrderIds.has(id)
                            : false;
                        return (
                          <span className="flex items-center gap-1.5 py-1 text-meta text-muted-foreground">
                            {isLoading ? (
                              <>
                                <RefreshCw className="h-3 w-3 animate-spin" />
                                Loading items…
                              </>
                            ) : (
                              'No items loaded'
                            )}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-semibold text-foreground">
                      {formatCurrency(o.total_amount)}
                    </TableCell>
                    <TableCell className="py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => openProcessPaymentConfirm(o)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <>
                              <RefreshCw className="animate-spin" />
                              Charging…
                            </>
                          ) : (
                            'Charge'
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-14 text-center text-muted-foreground"
                >
                  No orders waiting for payment
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
