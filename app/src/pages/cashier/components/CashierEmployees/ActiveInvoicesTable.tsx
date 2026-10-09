import { uuidToDisplayId, formatOrderNumber } from "@/lib/utils";
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, RefreshCw, MapPin, X } from 'lucide-react';

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
      <CardHeader className="flex flex-col gap-4 border-b sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-sm font-semibold text-foreground">
            Active Table Invoices
          </CardTitle>
          <CardDescription className="mt-0.5 text-xs">
            Collect and complete cash transactions
          </CardDescription>
        </div>

        <Badge variant="secondary" className="shrink-0">
          {ordersForPaymentSorted.length} Pending
        </Badge>
      </CardHeader>

      {tableSummaries.length > 0 && (
        <div className="flex items-center gap-2 px-4 pt-3">
          <MapPin className="size-4 text-muted-foreground shrink-0" />
          <Select
            value={selectedTable || 'all'}
            onValueChange={(v) => setSelectedTable(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="h-9 w-full sm:w-56 text-xs font-bold">
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
        <div className="mx-4 mt-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-extrabold text-foreground">
              <MapPin className="size-4 text-primary" />
              Table {selectedTable}
            </div>
            <button
              type="button"
              onClick={() => setSelectedTable('')}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Clear table filter"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {ordersForPaymentSorted.length} order{ordersForPaymentSorted.length === 1 ? '' : 's'} attached to this table
          </p>
          <div className="flex items-center justify-between rounded-xl border bg-background px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground">Total due</span>
            <span className="text-lg font-extrabold text-foreground">
              {formatCurrency(pendingSettleTotal)}
            </span>
          </div>
          <Button
            className="w-full gap-1.5"
            onClick={openSettleAllConfirm}
            disabled={settlingAll || ordersForPaymentSorted.length === 0}
          >
            {settlingAll ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Confirm all payments for Table {selectedTable}
          </Button>
        </div>
      )}

      {!selectedTable && ordersForPaymentSorted.length > 1 && (
        <div className="border-b px-4 py-3">
          <Button
            className="w-full gap-1.5"
            onClick={openSettleAllConfirm}
            disabled={settlingAll}
          >
            {settlingAll ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Settle all {ordersForPaymentSorted.length} • {formatCurrency(pendingSettleTotal)}
          </Button>
        </div>
      )}
      <CardContent className="flex-1 overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
              <TableHead className="h-10 text-xs font-medium uppercase text-muted-foreground">
                Order #
              </TableHead>
              <TableHead className="h-10 text-xs font-medium uppercase text-muted-foreground">
                Table
              </TableHead>
              <TableHead className="h-10 text-xs font-medium uppercase text-muted-foreground">
                Items
              </TableHead>
              <TableHead className="h-10 text-xs font-medium uppercase text-muted-foreground">
                Subtotal
              </TableHead>
              <TableHead className="h-10 text-right text-xs font-medium uppercase text-muted-foreground">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordersForPaymentSorted.length > 0 ? (
              ordersForPaymentSorted.map((o) => {
                const isProcessing = processingOrders.has(o.id);
                return (
                  <TableRow key={o.id} className="border-b">
                    <TableCell className="py-3.5 text-xs font-semibold text-foreground">
                      {formatOrderNumber(o)}
                    </TableCell>
                    <TableCell className="py-3.5 text-xs text-muted-foreground">
                      {o.order_type_label || (o.table_number ? `Table ${o.table_number}` : 'Take Away')}
                    </TableCell>
                    <TableCell className="min-w-[200px] py-3.5">
                      {(() => {
                        const items = getOrderItemsForRow(o);
                        if (items.length > 0) {
                          return (
                            <div className="space-y-1 rounded-lg border bg-muted/40 p-2.5 text-[11px]">
                              {items.map((item: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="flex justify-between text-muted-foreground"
                                >
                                  <span>
                                    {item.quantity}x {item.menu_item_name || item.name || 'Item'}
                                  </span>
                                  <span className="ml-3 font-medium text-foreground">
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
                          <span className="flex items-center gap-1.5 py-1 text-[11px] text-muted-foreground">
                            {isLoading ? (
                              <>
                                <RefreshCw className="h-3 w-3 animate-spin" />
                                Loading items...
                              </>
                            ) : (
                              'No items loaded'
                            )}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="py-3.5 text-xs font-semibold text-success">
                      {formatCurrency(o.total_amount)}
                    </TableCell>
                    <TableCell className="py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => openProcessPaymentConfirm(o)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <span className="flex items-center gap-1">
                              <RefreshCw className="h-3 w-3 animate-spin" />
                              Settling...
                            </span>
                          ) : (
                            'Settle Cash'
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
                  className="py-14 text-center text-xs text-muted-foreground"
                >
                  No active table invoices waiting for payment
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
