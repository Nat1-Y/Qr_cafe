import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Printer, Download, Calendar as CalendarIcon } from 'lucide-react';
import { printZReport } from '@/utils/receiptPrinter';
import api from '@/application';
import { DatePicker } from '@/components/ui/date-picker';
import { format } from 'date-fns';
import { formatETB } from '@/lib/format';

import StatsCard from '@/components/common/StatsCard';
import EmptyState from '@/components/common/EmptyState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
interface ZReportData {
  report_date: string;
  period_start: string;
  period_end: string;
  summary: {
    total_orders: number;
    total_sales_cents: number;
    total_sales: number;
    gross_sales_cents: number;
    gross_sales: number;
    refunds_cents: number;
    refunds: number;
    discounts_cents: number;
    discounts: number;
    net_sales_cents: number;
    net_sales: number;
  };
  payment_breakdown: Array<{
    method: string;
    amount_cents: number;
    amount: number;
    count: number;
    percentage: number;
  }>;
  employee_activity: Array<{
    employee_id: number;
    employee_name: string;
    orders_count: number;
    total_sales_cents: number;
    total_sales: number;
  }>;
  voided_transactions: Array<{
    order_id: number;
    employee_id: number;
    employee_name: string;
    amount_cents: number;
    amount: number;
    created_at: string;
  }>;
  category_breakdown: Array<{
    category: string;
    amount_cents: number;
    amount: number;
    count: number;
  }>;
}

const ZReport = () => {
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [loading, setLoading] = useState(false);
  const [zReport, setZReport] = useState<ZReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchZReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        start_date: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
        end_date: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
      }
      const response = await api.orders.getZReport(params);
      console.log('Z-Report response:', response);
      const zReportData = response.data.data.zReport;
      setZReport(zReportData);
    } catch (err: any) {
      console.error('Z-Report error:', err);
      setError(err.message || 'Failed to generate Z-report');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!zReport) return;
    try {
      await printZReport(zReport);
    } catch (err) {
      console.error('Print failed:', err);
    }
  };

  const formatCurrency = formatETB;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow mb-1">End of day</p>
          <h2 className="text-section text-foreground">Z-Report</h2>
          {zReport && (
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(zReport.period_start)} – {formatDate(zReport.period_end)} · generated {formatDate(zReport.report_date)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label>From</Label>
            <DatePicker date={startDate} onSelect={setStartDate} placeholder="Start date" />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <DatePicker date={endDate} onSelect={setEndDate} placeholder="End date" />
          </div>
          <Button onClick={fetchZReport} disabled={loading}>
            {loading ? 'Building…' : 'Build report'}
          </Button>
          {zReport && (
            <Button onClick={handlePrint} variant="outline">
              <Printer />
              Print
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-card bg-destructive-soft px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      {!zReport && !error && (
        <EmptyState
          className="rounded-card border border-dashed border-border"
          title="Pick the dates, then build the report"
          description="It totals orders, payments and staff sales for the period."
        />
      )}

      {zReport && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatsCard title="Orders" value={zReport.summary.total_orders} />
            <StatsCard title="Gross sales" value={formatCurrency(zReport.summary.gross_sales)} />
            <StatsCard title="Refunds" value={formatCurrency(zReport.summary.refunds)} variant="destructive" />
            <StatsCard title="Net sales" value={formatCurrency(zReport.summary.net_sales)} variant="success" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="overflow-hidden lg:col-span-2">
              <CardHeader className="border-b border-border">
                <CardTitle>Staff sales</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zReport.employee_activity.map((employee, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium text-foreground">{employee.employee_name}</TableCell>
                      <TableCell className="text-right">{employee.orders_count}</TableCell>
                      <TableCell className="text-right">{formatCurrency(employee.total_sales)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border">
                <CardTitle>By payment method</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zReport.payment_breakdown.map((payment, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="capitalize text-foreground">
                        {payment.method}
                        <span className="block text-meta text-muted-foreground">{payment.count} payments</span>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{payment.percentage.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="overflow-hidden lg:col-span-2">
              <CardHeader className="border-b border-border">
                <CardTitle>By category</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zReport.category_breakdown.map((category, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="capitalize text-foreground">{category.category}</TableCell>
                      <TableCell className="text-right">{category.count}</TableCell>
                      <TableCell className="text-right">{formatCurrency(category.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border">
                <CardTitle>Voided</CardTitle>
              </CardHeader>
              {zReport.voided_transactions.length > 0 ? (
                <ul className="divide-y divide-border">
                  {zReport.voided_transactions.map((txn, idx) => (
                    <li key={idx} className="flex items-start justify-between gap-3 px-6 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">#{txn.order_id}</p>
                        <p className="text-meta text-muted-foreground">
                          {txn.employee_name} · {formatDate(txn.created_at)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm text-destructive">{formatCurrency(txn.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">Nothing voided.</p>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default ZReport;
