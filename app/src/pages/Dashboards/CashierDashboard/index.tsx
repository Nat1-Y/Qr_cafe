import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Skeleton } from '@/components/ui/skeleton';
import StatsCard from '@/components/common/StatsCard';
import { useAuth } from '@/context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';

// Hooks
import { useCashierData } from './hooks/useCashierData';
import { useCashierStats } from './hooks/useCashierStats';
import {
  useCashierPrintingContext,
  CASHIER_REFRESH_EVENT,
} from '@/context/CashierPrintingContext';

// Components
import { HeaderBanner } from './components/HeaderBanner';
import { PrintFailureBanner } from './components/PrintFailureBanner';
import { QrAssistAlerts } from '@/components/qr/QrOrderBits';
import { DateFilterBar } from './components/DateFilterBar';
import { OrdersForPaymentPanel } from './components/OrdersForPaymentPanel';
import { RecentPaymentsPanel } from './components/RecentPaymentsPanel';
import { useEffect } from 'react';
import { ModalSection } from './components/ModalSection';
import SettleAllPaymentsModal from './modals/SettleAllPaymentsModal';
import { ChargeOrderPanel } from './modals/ConfirmCashPaymentModal';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const CashierDashboard = () => {
  const { user } = useAuth() as any;

  // Printing system — the auto-print engine itself lives in
  // CashierPrintingProvider (mounted in DashboardLayout) so it keeps receiving
  // and printing orders even while the cashier is on another page. Here we just
  // consume that single shared instance.
  const {
    qzStatus,
    testQzPrint,
    printOrderImmediately,
    pollUnprintedOrders,
    stuckPrintOrders,
    retryStuckPrint,
  } = useCashierPrintingContext();

  // Data fetching
  const {
    loading,
    dashboardData,
    syncStatus,
    expandedRecentPaymentIds,
    loadingRecentPaymentOrderIds,
    processingOrders,
    isBlockingPaymentUi,
    showReportsModal,
    setShowReportsModal,
    showProfileModal,
    setShowProfileModal,
    showConfirmProcessPaymentModal,
    setShowConfirmProcessPaymentModal,
    confirmProcessPaymentOrder,
    paymentMethod,
    setPaymentMethod,
    profileData,
    setProfileData,
    menuItems,
    menuMainCategoryById,
    orderDetailsById,
    orderIndex,
    handleManualSync,
    refreshDashboardData,
    openProcessPaymentConfirm,
    toggleRecentPaymentDetails,
    updateProfile,
    confirmCashPayment,
    settlingBatch,
    batchProgress,
    showSettleTableModal,
    setShowSettleTableModal,
    handleSettleOrders,
  } = useCashierData({
    user,
    printOrderImmediately,
    pollUnprintedOrders
  });
  // The background print engine (in CashierPrintingProvider) dispatches this
  // event after each print pass. While the dashboard is open, refresh its lists
  // so a newly arrived/printed order shows up without waiting for a poll.
  useEffect(() => {
    const onRefresh = () => {
      refreshDashboardData();
    };
    window.addEventListener(CASHIER_REFRESH_EVENT, onRefresh);
    return () => {
      window.removeEventListener(CASHIER_REFRESH_EVENT, onRefresh);
    };
  }, [refreshDashboardData]);

  const [mainCategories, setMainCategories] = useState<Array<{ name: string; slug: string }>>([]);

  // Whether the stat card values (payments count, revenue, pending total) are
  // shown or masked. Persisted so the cashier's privacy preference sticks
  // across reloads/shift changes on the same machine.
  const [showStatsValues, setShowStatsValues] = useState<boolean>(() => {
    try {
      return localStorage.getItem('cashier_dashboard_stats_visible') !== 'false';
    } catch {
      return true;
    }
  });

  const toggleStatsVisibility = () => {
    setShowStatsValues((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cashier_dashboard_stats_visible', String(next));
      } catch {
        // ignore storage errors (e.g. private mode)
      }
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = (await (await import('@/application')).default.menu.getMainCategories({ is_active: true })) as any;
        const payload = resp?.data ?? resp;
        const categoriesRaw =
          payload?.data?.mainCategories || payload?.mainCategories || payload?.data || [];
        const normalized = (Array.isArray(categoriesRaw)
          ? categoriesRaw
            .map((entry: any) => {
              const rawSlug = String(entry?.slug || entry?.name || "").trim().toLowerCase();
              const slug = rawSlug.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
              if (!slug) return null;
              const name = String(entry?.name || slug).trim().replace(/_/g, ' ');
              return { name, slug };
            })
            .filter((v): v is { name: string; slug: string } => Boolean(v))
          : []) as Array<{ name: string; slug: string }>;
        if (cancelled) return;
        if (normalized.length > 0) setMainCategories(normalized);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Stats calculations
  const {
    statsRange,
    setStatsRange,
    customStatsDate,
    setCustomStatsDate,
    businessUnit,
    setBusinessUnit,
    selectedMenuItemId,
    setSelectedMenuItemId,
    tableNumberFilter,
    setTableNumberFilter,
    formatCurrency,
    menuItemsForSelectedUnit,
    getItemSubtotalBirr,
    getOrderUnitBreakdown,
    getOrderSubtotalForUnitAndMenuItem,
    orderMatchesBusinessUnit,
    getPaymentAmountForSelection,
    statsRangeLabel,
    filteredRecentPayments,
    pendingOrdersTotalBirr,
    todayStats
  } = useCashierStats({
    paymentsAll: dashboardData.paymentsAll,
    ordersForPayment: dashboardData.ordersForPayment,
    user,
    menuItems,
    menuMainCategoryById,
    orderDetailsById
  });

  // Sort orders for payment
  const ordersForPaymentSorted = useMemo(() => {
    const list = Array.isArray(dashboardData.ordersForPayment) ? dashboardData.ordersForPayment : [];
    return list
      .slice()
      .sort((a: any, b: any) => {
        const ad = new Date(a?.created_at || a?.updated_at);
        const bd = new Date(b?.created_at || b?.updated_at);
        const at = Number.isNaN(ad.getTime()) ? null : ad.getTime();
        const bt = Number.isNaN(bd.getTime()) ? null : bd.getTime();
        if (at != null && bt != null) return bt - at;
        if (at != null) return -1;
        if (bt != null) return 1;
        return (b?.id || 0) - (a?.id || 0);
      });
  }, [dashboardData.ordersForPayment]);

  // Filter orders for payment by business unit and table
  const visibleOrders = ordersForPaymentSorted.filter((o: any) => {
    const matchesUnit = orderMatchesBusinessUnit(o);
    const filter = tableNumberFilter.trim().toLowerCase();
    const matchesTable = !filter ||
      String(o.table_number ?? '').trim().toLowerCase() === filter;
    return matchesUnit && matchesTable;
  });

  // Distinct table numbers across the (business-unit-filtered) queue, each with
  // its order count + total, for the table-selector pill row. Table selection
  // itself reuses `tableNumberFilter` (exact match) rather than a new filter.
  const tableSummaries = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const o of ordersForPaymentSorted) {
      if (!orderMatchesBusinessUnit(o)) continue;
      const t = o?.table_number != null ? String(o.table_number).trim() : '';
      if (!t) continue;
      const entry = map.get(t) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += parseFloat(o.total_amount) || 0;
      map.set(t, entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => {
        const an = parseFloat(a[0]);
        const bn = parseFloat(b[0]);
        if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
        return a[0].localeCompare(b[0]);
      })
      .map(([table_number, v]) => ({ table_number, ...v }));
  }, [ordersForPaymentSorted, orderMatchesBusinessUnit]);

  // Drop a stale table filter once that table has no orders left (e.g. all settled).
  useEffect(() => {
    if (!tableNumberFilter) return;
    const filter = tableNumberFilter.trim().toLowerCase();
    const stillExists = ordersForPaymentSorted.some(
      (o: any) => String(o.table_number ?? '').trim().toLowerCase() === filter,
    );
    if (!stillExists) setTableNumberFilter('');
  }, [ordersForPaymentSorted, tableNumberFilter, setTableNumberFilter]);

  const visibleOrdersTotal = visibleOrders.reduce(
    (sum: number, o: any) => sum + (parseFloat(o.total_amount) || 0),
    0,
  );

  const openSettleTableConfirm = () => {
    if (visibleOrders.length === 0 || settlingBatch) return;
    setShowSettleTableModal(true);
  };

  const confirmSettleTable = () => handleSettleOrders(visibleOrders, paymentMethod);


  // Stats cards data
  const HIDDEN_STATS_PLACEHOLDER = '••••••';
  // "Today's" -> "Today", "This Week's" -> "This week"
  const rangeText = statsRangeLabel.replace(/'s$/i, '').toLowerCase();
  const rangeHint = rangeText.charAt(0).toUpperCase() + rangeText.slice(1);
  const statsCards = [
    {
      title: 'Payments taken',
      subtitle: rangeHint,
      value: showStatsValues ? todayStats.paymentsProcessed : HIDDEN_STATS_PLACEHOLDER,
      variant: 'default' as const
    },
    {
      title: 'Money in',
      subtitle: rangeHint,
      value: showStatsValues ? formatCurrency(todayStats.totalRevenue) : HIDDEN_STATS_PLACEHOLDER,
      variant: 'success' as const
    },
    {
      title: 'Waiting to be paid',
      subtitle: 'Right now',
      value: showStatsValues ? formatCurrency(pendingOrdersTotalBirr || 0) : HIDDEN_STATS_PLACEHOLDER,
      variant: 'default' as const
    },
  ];

  // Wide screens dock the charge panel beside the queue instead of a dialog.
  const isWide = useMediaQuery('(min-width: 1024px)');
  const showDockedCharge = isWide && showConfirmProcessPaymentModal && !!confirmProcessPaymentOrder;

  if (loading) {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <Skeleton className="h-16 w-72" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 w-full rounded-card" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Skeleton className="h-96 w-full rounded-card" />
          <Skeleton className="h-72 w-full rounded-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Blocks the till while a payment is being recorded */}
      {isBlockingPaymentUi && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 flex items-center justify-center bg-overlay" style={{ zIndex: 2147483647 }}>
          <div className="mx-4 flex w-full max-w-xs flex-col items-center gap-4 rounded-card border border-border bg-card p-6 shadow-pop">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <p className="text-sm font-medium text-foreground">Saving payment…</p>
          </div>
        </div>,
        document.body
      )}

      <HeaderBanner
        businessUnit={businessUnit}
        setBusinessUnit={setBusinessUnit}
        selectedMenuItemId={selectedMenuItemId}
        setSelectedMenuItemId={setSelectedMenuItemId}
        menuItemsForSelectedUnit={menuItemsForSelectedUnit}
        mainCategories={mainCategories}
        qzStatus={qzStatus}
        syncStatus={syncStatus}
        onManualSync={handleManualSync}
        onTestPrint={testQzPrint}
        waitingCount={visibleOrders.length}
      />

      {/* Persistent alert for orders stuck failing to print */}
      <PrintFailureBanner
        stuckOrders={stuckPrintOrders}
        onRetry={retryStuckPrint}
      />

      {/* Guest requests from QR tables ("Call waiter", "Ask for the bill") */}
      <QrAssistAlerts />

      {/* KPI row */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DateFilterBar
            statsRange={statsRange}
            setStatsRange={setStatsRange}
            customStatsDate={customStatsDate}
            setCustomStatsDate={setCustomStatsDate}
          />
          <button
            type="button"
            onClick={toggleStatsVisibility}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={showStatsValues ? 'Hide stat values' : 'Show stat values'}
            title={showStatsValues ? 'Hide stat values' : 'Show stat values'}
          >
            {showStatsValues ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span>{showStatsValues ? 'Hide numbers' : 'Show numbers'}</span>
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {statsCards.map((card, index) => (
            <StatsCard key={index} title={card.title} subtitle={card.subtitle} value={card.value} variant={card.variant} />
          ))}
        </div>
      </section>

      {/* Live orders (60%) and the current order / payment (40%) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <OrdersForPaymentPanel
          orders={visibleOrders}
          loading={loading}
          expandedPaymentIds={expandedRecentPaymentIds}
          loadingOrderIds={loadingRecentPaymentOrderIds}
          processingOrderIds={processingOrders}
          isBlockingPaymentUi={isBlockingPaymentUi}
          businessUnit={businessUnit}
          selectedMenuItemId={selectedMenuItemId}
          tableNumberFilter={tableNumberFilter}
          setTableNumberFilter={setTableNumberFilter}
          tableSummaries={tableSummaries}
          visibleOrdersTotal={visibleOrdersTotal}
          onOpenSettleTable={openSettleTableConfirm}
          settlingBatch={settlingBatch}
          formatCurrency={formatCurrency}
          getOrderSubtotalForUnitAndMenuItem={getOrderSubtotalForUnitAndMenuItem}
          getOrderUnitBreakdown={getOrderUnitBreakdown}
          getItemSubtotalBirr={getItemSubtotalBirr}
          toggleRecentPaymentDetails={toggleRecentPaymentDetails}
          onConfirmPayment={openProcessPaymentConfirm}
          currentUserId={user?.id}
          currentUserRole={user?.role}
          selectedOrderId={showDockedCharge ? confirmProcessPaymentOrder?.id : null}
        />

        <div className="space-y-6 lg:sticky lg:top-6">
          {isWide && (
            showDockedCharge ? (
              <ChargeOrderPanel
                confirmProcessPaymentOrder={confirmProcessPaymentOrder}
                isBlockingPaymentUi={isBlockingPaymentUi}
                isProcessing={processingOrders.has(confirmProcessPaymentOrder?.id)}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                onConfirm={() => confirmCashPayment(confirmProcessPaymentOrder, paymentMethod)}
                onCancel={() => setShowConfirmProcessPaymentModal(false)}
                formatCurrency={formatCurrency}
                getOrderUnitBreakdown={getOrderUnitBreakdown}
                getItemSubtotalBirr={getItemSubtotalBirr}
              />
            ) : (
              <div className="rounded-card border border-dashed border-border bg-card px-6 py-8">
                <p className="eyebrow">Current order</p>
                <p className="mt-1 text-sm text-muted-foreground">Pick an order on the left to charge it.</p>
              </div>
            )
          )}

          <RecentPaymentsPanel
            payments={filteredRecentPayments}
            loading={loading}
            expandedPaymentIds={expandedRecentPaymentIds}
            loadingOrderIds={loadingRecentPaymentOrderIds}
            orderDetailsById={orderDetailsById}
            orderIndex={orderIndex}
            businessUnit={businessUnit}
            selectedMenuItemId={selectedMenuItemId}
            formatCurrency={formatCurrency}
            getOrderUnitBreakdown={getOrderUnitBreakdown}
            getItemSubtotalBirr={getItemSubtotalBirr}
            getPaymentAmountForSelection={getPaymentAmountForSelection}
            toggleRecentPaymentDetails={toggleRecentPaymentDetails}
          />
        </div>
      </div>

      {/* Modals — the charge dialog only opens on narrow screens; wide screens use the docked panel */}
      <ModalSection
        isOnline={syncStatus.online}
        user={user}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        showConfirmProcessPaymentModal={showConfirmProcessPaymentModal && !isWide}
        setShowConfirmProcessPaymentModal={setShowConfirmProcessPaymentModal}
        confirmProcessPaymentOrder={confirmProcessPaymentOrder}
        isBlockingPaymentUi={isBlockingPaymentUi}
        isProcessing={processingOrders.has(confirmProcessPaymentOrder?.id)}
        onConfirmCashPayment={() => confirmCashPayment(confirmProcessPaymentOrder, paymentMethod)}
        showReportsModal={showReportsModal}
        setShowReportsModal={setShowReportsModal}
        todayStats={todayStats}
        showProfileModal={showProfileModal}
        setShowProfileModal={setShowProfileModal}
        profileData={profileData}
        setProfileData={setProfileData}
        onUpdateProfile={updateProfile}
        formatCurrency={formatCurrency}
        getOrderUnitBreakdown={getOrderUnitBreakdown}
        getItemSubtotalBirr={getItemSubtotalBirr}
      />

      <SettleAllPaymentsModal
        open={showSettleTableModal}
        onOpenChange={(open) => { if (!open && !settlingBatch) setShowSettleTableModal(false); }}
        count={visibleOrders.length}
        total={visibleOrdersTotal}
        employeeName={tableNumberFilter ? `Table ${tableNumberFilter}` : undefined}
        isProcessing={settlingBatch}
        progress={batchProgress}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        onConfirm={confirmSettleTable}
        formatCurrency={formatCurrency}
      />
    </div>
  );
};

export default CashierDashboard;
