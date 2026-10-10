import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ReportsData } from '../types';
import { formatDateTime } from '../utils';
import { formatETB } from '@/lib/format';

interface ExpenseReportsProps {
  reports: ReportsData;
}

export const ExpenseReports: React.FC<ExpenseReportsProps> = ({ reports }) => {
  const totals = reports?.totals || { daily: 0, weekly: 0, monthly: 0, yearly: 0 };
  const expenseVsSales = reports?.expense_vs_sales || null;

  return (
    <div className="space-y-6">
      {/* Grid of Reports */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="flex flex-col">
          <CardHeader><CardTitle>Totals</CardTitle></CardHeader>
          <CardContent className="flex-1 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-success/5 border border-success/20 p-3">
              <p className="text-xs font-semibold text-success">Daily</p>
              <p className="mt-1 font-semibold text-sm text-success">{formatETB(totals.daily)}</p>
            </div>
            <div className="rounded-xl bg-info/5 border border-info/20 p-3">
              <p className="text-xs font-semibold text-info">Weekly</p>
              <p className="mt-1 font-semibold text-sm text-info">{formatETB(totals.weekly)}</p>
            </div>
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
              <p className="text-xs font-semibold text-primary">Monthly</p>
              <p className="mt-1 font-semibold text-sm text-primary">{formatETB(totals.monthly)}</p>
            </div>
            <div className="rounded-xl bg-warning-soft border border-warning/30 p-3">
              <p className="text-xs font-semibold text-warning">Yearly</p>
              <p className="mt-1 font-semibold text-sm text-warning">{formatETB(totals.yearly)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader><CardTitle>Spent by category</CardTitle></CardHeader>
          <CardContent className="flex-1 max-h-[220px] overflow-y-auto space-y-2 pr-1">
            {(reports.category_totals || []).length === 0 ? (
              <p className="text-xs text-muted-foreground font-medium text-center py-8">No expenses yet.</p>
            ) : (
              reports.category_totals.map((item: any) => (
                <div key={item.category_key} className="flex items-center justify-between border-b border-border py-3 last:border-b-0">
                  <div>
                    <p className="font-semibold text-xs text-foreground">{item.category}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.count} entries</p>
                  </div>
                  <p className="font-semibold text-xs text-destructive">{formatETB(item.total)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader><CardTitle>Top 5 biggest expenses</CardTitle></CardHeader>
          <CardContent className="flex-1 max-h-[220px] overflow-y-auto space-y-2 pr-1">
            {(reports.top_expenses || []).length === 0 ? (
              <p className="text-xs text-muted-foreground font-medium text-center py-8">No expenses yet.</p>
            ) : (
              reports.top_expenses.map((expense: any) => (
                <div key={expense.id} className="flex items-center justify-between border-b border-border py-3 last:border-b-0">
                  <div>
                    <p className="font-semibold text-xs text-foreground truncate max-w-[150px]">{expense.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{expense.category} · {expense.payment_method}</p>
                  </div>
                  <p className="font-semibold text-xs text-destructive shrink-0">{formatETB(expense.amount || expense.total)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expenses vs Sales Comparison */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Expenses and sales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="rounded-card border border-border bg-card px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground">Expenses</p>
              <p className="mt-1 font-semibold text-base text-destructive">{formatETB(expenseVsSales?.total_expenses)}</p>
            </div>
            <div className="rounded-card border border-border bg-card px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground">Sales</p>
              <p className="mt-1 font-semibold text-base text-success">{formatETB(expenseVsSales?.total_sales)}</p>
            </div>
            <div className="rounded-card border border-border bg-card px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground">Difference</p>
              <p className={`mt-1 font-semibold text-base ${(expenseVsSales?.difference || 0) < 0 ? 'text-destructive' : 'text-success'}`}>
                {formatETB(expenseVsSales?.difference)}
              </p>
            </div>
            <div className="rounded-card border border-border bg-card px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground">Expenses as part of sales</p>
              <p className="mt-1 font-semibold text-base text-foreground">{Number.parseFloat(String(expenseVsSales?.expense_ratio || 0)).toFixed(1)}%</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium mt-3 text-right">
            Dates: {expenseVsSales?.date_from ? formatDateTime(expenseVsSales.date_from) : '—'} to {expenseVsSales?.date_to ? formatDateTime(expenseVsSales.date_to) : '—'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
export default ExpenseReports;
