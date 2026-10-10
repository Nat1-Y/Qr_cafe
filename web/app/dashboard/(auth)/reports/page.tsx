"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart2,
  Download,
  FileText,
  PackageSearch,
  PieChart,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { DateFilterBar } from "@/components/date-filter-bar";
import { Orders, Payments, Menu, Expenses } from "@/lib/resources";
import {
  INITIAL_REPORT_DATA,
  calculateReportData,
  exportBusinessData,
  filterSourceDataByDateRange,
  type SourceData,
} from "@/lib/reports";

import { ReportsStats } from "@/components/reports/reports-stats";

import { RevenueTrend } from "@/components/reports/revenue-trend";
import { PaymentMethodsBreakdown } from "@/components/reports/payment-methods-breakdown";
import { CategorySales } from "@/components/reports/category-sales";
import { HourlyPerformance } from "@/components/reports/hourly-performance";
import { PopularMenuItems } from "@/components/reports/popular-menu-items";

import { ZReport } from "@/components/reports/z-report";
import { friendlyError } from "@/lib/errors";

const inputCls = "border-input bg-background h-9 rounded-md border px-3 text-sm";

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<SourceData>({ orders: [], payments: [], menuItems: [] });
  const [expenses, setExpenses] = useState<any[]>([]);
  const [businessUnit, setBusinessUnit] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [topItemsPeriod, setTopItemsPeriod] = useState("selected_range");

  const loadSource = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [orders, payments, menuItems, expenseRows] = await Promise.all([
        // Organization orders settle on their own credit ledger, not as cash
        // sales — never count them toward these reports.
        Orders.list({ exclude_organization: "1" }).catch(() => []),
        Payments.history().catch(() => []),
        Menu.items().catch(() => []),
        Expenses.list().catch(() => []),
      ]);
      setSource({
        orders: Array.isArray(orders) ? orders : [],
        payments: Array.isArray(payments) ? payments : [],
        menuItems: Array.isArray(menuItems) ? menuItems : [],
      });
      setExpenses(Array.isArray(expenseRows) ? expenseRows : []);
    } catch (e: any) {
      toast.error(friendlyError(e, "Couldn't load report data. Please try again."));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadSource();
  }, []);

  const reportData = useMemo(() => {
    if (loading) return INITIAL_REPORT_DATA;
    const filtered = filterSourceDataByDateRange(
      source.orders,
      source.payments,
      source.menuItems,
      dateFrom,
      dateTo,
    );
    return calculateReportData(
      filtered.orders,
      filtered.payments,
      filtered.menuItems,
      businessUnit,
      topItemsPeriod,
    );
  }, [loading, source, businessUnit, dateFrom, dateTo, topItemsPeriod]);

  const handleExport = async () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      toast.error("The From date must be before the To date.");
      return;
    }
    try {
      await exportBusinessData(source, businessUnit, dateFrom, dateTo);
      toast.success("Excel file downloaded");
    } catch (e: any) {
      toast.error(friendlyError(e, "Couldn't make the Excel file. Please try again."));
    }
  };

  const handleGenerate = async () => {
    await loadSource(true);
    toast.success("Report is up to date");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales & reports"
        description="See how the business is doing and download the numbers."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={businessUnit}
              onChange={(e) => setBusinessUnit(e.target.value)}
              className={inputCls}
              aria-label="Section">
              <option value="all">All sections</option>
              <option value="cafe">Cafe</option>
              <option value="restaurant">Restaurant</option>
              <option value="barista">Barista</option>
            </select>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download />
              Download Excel
            </Button>
            <Button size="sm" onClick={handleGenerate}>
              <BarChart2 />
              Make report
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <DateFilterBar
            defaultPreset="all"
            allLabel="All time"
            viewingPrefix="Showing:"
            onChange={(range) => {
              setDateFrom(range.from ?? "");
              setDateTo(range.to ?? "");
            }}
          />
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-96 w-full rounded-card" />
        </div>
      ) : (
        <>
          <ReportsStats source={source} unit={businessUnit} dateFrom={dateFrom} dateTo={dateTo} />

          <Tabs defaultValue="z-report" className="space-y-5 overflow-auto">
            <TabsList className="flex h-auto w-full flex-wrap justify-between gap-1 p-1">
              <TabsTrigger value="z-report" className="gap-2">
                <FileText className="size-4" />
                <span className="hidden sm:inline">End of day report</span>
              </TabsTrigger>
              <TabsTrigger value="overview" className="gap-2">
                <TrendingUp className="size-4" />
                <span className="hidden sm:inline">Overview</span>
              </TabsTrigger>
              <TabsTrigger value="product-mix" className="gap-2">
                <PackageSearch className="size-4" />
                <span className="hidden sm:inline">What sold</span>
              </TabsTrigger>
              <TabsTrigger value="sales-breakdown" className="gap-2">
                <PieChart className="size-4" />
                <span className="hidden sm:inline">Sales split</span>
              </TabsTrigger>
              <TabsTrigger value="operations" className="gap-2">
                <BarChart2 className="size-4" />
                <span className="hidden sm:inline">Busy times</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="z-report" className="space-y-6">
              <ZReport dateFrom={dateFrom} dateTo={dateTo} />
            </TabsContent>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
                <RevenueTrend points={reportData.revenueTrend} />
                <PaymentMethodsBreakdown paymentMethods={reportData.paymentMethods} />
              </div>
            </TabsContent>

            <TabsContent value="product-mix" className="space-y-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1fr]">
                <PopularMenuItems
                  topItems={reportData.topItems}
                  topItemsPeriod={topItemsPeriod}
                  setTopItemsPeriod={setTopItemsPeriod}
                />
                <CategorySales items={reportData.categorySales} />
              </div>
            </TabsContent>

            <TabsContent value="sales-breakdown" className="space-y-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <PaymentMethodsBreakdown paymentMethods={reportData.paymentMethods} />
                <CategorySales items={reportData.categorySales} />
              </div>
            </TabsContent>

            <TabsContent value="operations" className="space-y-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1fr]">
                <HourlyPerformance items={reportData.hourlyPerformance} />
                <Card>
                  <CardContent className="space-y-4 pt-6">
                    <h3 className="text-sm font-semibold">Plan your shifts</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      See your busiest hours and how customers pay before you change shifts or
              how much you prepare.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
           
          </Tabs>
        </>
      )}
    </div>
  );
}
