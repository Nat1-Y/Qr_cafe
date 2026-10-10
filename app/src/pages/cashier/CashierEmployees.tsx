import LoadingSpinner from '@/components/common/LoadingSpinner';
import { ArrowLeft } from 'lucide-react';
import BranchBadge from '@/components/common/BranchBadge';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/layout/PageHeader';
import Segmented from '@/components/common/Segmented';

// Custom Hooks & Modular Components
import { useCashierEmployeesData } from './hooks/useCashierEmployeesData';
import { EmployeeSelectView } from './components/CashierEmployees/EmployeeSelectView';
import { EmployeeStatsGrid } from './components/CashierEmployees/EmployeeStatsGrid';
import { ActiveInvoicesTable } from './components/CashierEmployees/ActiveInvoicesTable';
import { CheckoutTimeline } from './components/CashierEmployees/CheckoutTimeline';
import ConfirmCashPaymentModal from '@/pages/Dashboards/CashierDashboard/modals/ConfirmCashPaymentModal';
import SettleAllPaymentsModal from '@/pages/Dashboards/CashierDashboard/modals/SettleAllPaymentsModal';

const RANGE_LABELS: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Week',
  month: 'Month',
};

const CashierEmployees = () => {
  const {
    loading,
    employees,
    selectedEmployeeId,
    setSelectedEmployeeId,
    selectedTable,
    setSelectedTable,
    tableSummaries,
    statsRange,
    setStatsRange,
    employeeOrders,
    employeeStats,
    ordersForPaymentSorted,
    loadingOrderIds,
    processingOrders,
    showProcessPaymentConfirmModal,
    confirmProcessPaymentOrder,
    selectedEmployee,
    paymentMethod,
    setPaymentMethod,
    normalizeStatus,
    getOrderItemsForRow,
    openProcessPaymentConfirm,
    handleProcessPaymentNo,
    handleProcessPaymentYes,
    pendingSettleTotal,
    showSettleAllModal,
    settlingAll,
    settleAllProgress,
    openSettleAllConfirm,
    handleSettleAllNo,
    handleSettleAll,
    formatOrderItemsPreview,
    formatCurrency
  } = useCashierEmployeesData();

  if (loading && employees.length === 0) {
    return <LoadingSpinner text="Loading waiters…" />;
  }

  // FIRST VIEW: employees select view with built-in search filter
  if (!selectedEmployeeId) {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <PageHeader
          title="Waiters"
          description="Pick a waiter to see their orders and take payment."
          actions={<BranchBadge />}
        />

        <EmployeeSelectView
          employees={employees}
          onSelectEmployee={setSelectedEmployeeId}
        />
      </div>
    );
  }

  // SECOND VIEW: waiter statistics and checkout management dashboard
  return (
    <div className="p-4 md:p-8">
      <div className="space-y-6">
        <PageHeader
          eyebrow="Waiter"
          title={selectedEmployee?.full_name || selectedEmployeeId}
          description="This waiter's orders and payments."
          actions={
            <Button variant="outline" onClick={() => setSelectedEmployeeId('')}>
              <ArrowLeft /> All waiters
            </Button>
          }
        />

        <EmployeeStatsGrid stats={employeeStats} formatCurrency={formatCurrency} />

        <Segmented
          aria-label="Time range"
          value={statsRange}
          onChange={(range) => setStatsRange(range)}
          options={['today', 'yesterday', 'week', 'month'].map((range) => ({
            value: range,
            label: RANGE_LABELS[range] ?? range,
          }))}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: Orders Ready for Cashier Checkout Completion */}
          <ActiveInvoicesTable
            ordersForPaymentSorted={ordersForPaymentSorted}
            selectedTable={selectedTable}
            setSelectedTable={setSelectedTable}
            tableSummaries={tableSummaries}
            getOrderItemsForRow={getOrderItemsForRow}
            loadingOrderIds={loadingOrderIds}
            processingOrders={processingOrders}
            openProcessPaymentConfirm={openProcessPaymentConfirm}
            formatCurrency={formatCurrency}
            pendingSettleTotal={pendingSettleTotal}
            settlingAll={settlingAll}
            openSettleAllConfirm={openSettleAllConfirm}
          />

          {/* Right: Recent Orders timeline tracker */}
          <CheckoutTimeline
            employeeOrders={employeeOrders}
            statsRange={statsRange}
            normalizeStatus={normalizeStatus}
            formatOrderItemsPreview={formatOrderItemsPreview}
            formatCurrency={formatCurrency}
          />
        </div>

        <ConfirmCashPaymentModal
          open={showProcessPaymentConfirmModal}
          onOpenChange={(open) => { if (!open) handleProcessPaymentNo(); }}
          confirmProcessPaymentOrder={confirmProcessPaymentOrder}
          isBlockingPaymentUi={false}
          isProcessing={processingOrders.has(confirmProcessPaymentOrder?.id)}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          onConfirm={handleProcessPaymentYes}
          formatCurrency={formatCurrency}
        />

        <SettleAllPaymentsModal
          open={showSettleAllModal}
          onOpenChange={(open) => { if (!open) handleSettleAllNo(); }}
          count={ordersForPaymentSorted.length}
          total={pendingSettleTotal}
          employeeName={
            selectedTable
              ? `${selectedEmployee?.full_name || 'this waiter'} — Table ${selectedTable}`
              : selectedEmployee?.full_name
          }
          isProcessing={settlingAll}
          progress={settleAllProgress}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          onConfirm={handleSettleAll}
          formatCurrency={formatCurrency}
        />
      </div>
    </div>
  );
};

export default CashierEmployees;
