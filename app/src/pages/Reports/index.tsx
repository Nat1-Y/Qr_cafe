import React from 'react';
import { BarChart2, Download, FileText, ListOrdered, PackageSearch, PieChart, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/layout/PageHeader';
import { DatePicker } from '@/components/ui/date-picker';

import { useReportsData } from './hooks/useReportsData';
import ReportsStats from './components/ReportsStats';
import RevenueTrend from './components/RevenueTrend';
import PaymentMethodsBreakdown from './components/PaymentMethodsBreakdown';
import RecentOrdersList from './components/RecentOrdersList';
import PopularMenuItems from './components/PopularMenuItems';
import SubReportsQuickActions from './components/SubReportsQuickActions';
import CategorySales from './components/CategorySales';
import HourlyPerformance from './components/HourlyPerformance';
import ZReport from './ZReport';

const Reports: React.FC = () => {
  const {
    loading,
    businessUnit,
    setBusinessUnit,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    topItemsPeriod,
    setTopItemsPeriod,
    reportData,
    handleExportReport,
    handleGenerateReport,
    handleInventoryReports,
    handleCustomerAnalytics,
    handlePerformanceMetrics
  } = useReportsData();

  const [fromDate, setFromDate] = React.useState<Date | undefined>(
    dateFrom ? new Date(dateFrom) : undefined
  );
  const [toDate, setToDate] = React.useState<Date | undefined>(
    dateTo ? new Date(dateTo) : undefined
  );

  const handleFromDateChange = (date: Date | undefined) => {
    setFromDate(date);
    setDateFrom(date ? date.toISOString().split('T')[0] : '');
  };

  const handleToDateChange = (date: Date | undefined) => {
    setToDate(date);
    setDateTo(date ? date.toISOString().split('T')[0] : '');
  };

  React.useEffect(() => {
    setFromDate(dateFrom ? new Date(dateFrom) : undefined);
  }, [dateFrom]);

  React.useEffect(() => {
    setToDate(dateTo ? new Date(dateTo) : undefined);
  }, [dateTo]);

  if (loading) {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <Skeleton className="h-20 w-full rounded-card" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-96 w-full rounded-card" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader
        title="Business reports"
        description="Analytics, operational metrics, and complete data exports"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExportReport}>
              <Download />
              Export
            </Button>
            <Button onClick={handleGenerateReport}>
              <BarChart2 />
              Generate
            </Button>
          </div>
        }
      />

      {/* Filter bar: date range and unit */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <DatePicker
            date={fromDate}
            onSelect={handleFromDateChange}
            placeholder="From date"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <DatePicker
            date={toDate}
            onSelect={handleToDateChange}
            placeholder="To date"
          />
        </div>
        <Select value={businessUnit} onValueChange={setBusinessUnit}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All units" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All units</SelectItem>
            <SelectItem value="cafe">Cafe</SelectItem>
            <SelectItem value="restaurant">Restaurant</SelectItem>
            <SelectItem value="barista">Barista</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ReportsStats reportData={reportData} />

      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="product-mix" className="gap-2">
            <PackageSearch className="h-4 w-4" />
            Product mix
          </TabsTrigger>
          <TabsTrigger value="sales-breakdown" className="gap-2">
            <PieChart className="h-4 w-4" />
            Sales breakdown
          </TabsTrigger>
          <TabsTrigger value="operations" className="gap-2">
            <BarChart2 className="h-4 w-4" />
            Operations
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-2">
            <ListOrdered className="h-4 w-4" />
            Orders
          </TabsTrigger>
          <TabsTrigger value="z-report" className="gap-2">
            <FileText className="h-4 w-4" />
            Z-Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6">
            <RevenueTrend points={reportData.revenueTrend} />
            <PaymentMethodsBreakdown paymentMethods={reportData.paymentMethods} />
          </div>
          <SubReportsQuickActions
            handleCustomerAnalytics={handleCustomerAnalytics}
            handleInventoryReports={handleInventoryReports}
            handlePerformanceMetrics={handlePerformanceMetrics}
          />
        </TabsContent>

        <TabsContent value="product-mix" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-6">
            <PopularMenuItems
              topItems={reportData.topItems}
              topItemsPeriod={topItemsPeriod}
              setTopItemsPeriod={setTopItemsPeriod}
            />
            <CategorySales items={reportData.categorySales} />
          </div>
        </TabsContent>

        <TabsContent value="sales-breakdown" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <PaymentMethodsBreakdown paymentMethods={reportData.paymentMethods} />
            <CategorySales items={reportData.categorySales} />
          </div>
        </TabsContent>

        <TabsContent value="operations" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-6">
            <HourlyPerformance items={reportData.hourlyPerformance} />
            <div className="rounded-md border bg-card p-5">
              <h3 className="text-sm font-semibold mb-2">Operational focus</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Use this view to identify rush hours, staffing pressure, and settlement patterns before adjusting shifts or prep quantities.
              </p>
              <div className="grid grid-cols-1 gap-3">
                <Button variant="outline" onClick={handlePerformanceMetrics}>Open performance metrics</Button>
                <Button variant="outline" onClick={handleInventoryReports}>Open inventory reports</Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="orders" className="space-y-6">
          <RecentOrdersList recentOrders={reportData.recentOrders} />
        </TabsContent>

        <TabsContent value="z-report" className="space-y-6">
          <ZReport />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;
