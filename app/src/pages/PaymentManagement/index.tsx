import React from 'react';
import PageHeader from '@/components/layout/PageHeader';
import usePaymentData from './hooks/usePaymentData';
import PaymentStats from './components/PaymentStats';
import PaymentFilters from './components/PaymentFilters';
import PaymentsTable from './components/PaymentsTable';
import ViewPaymentDialog from './components/ViewPaymentDialog';

export const PaymentManagement: React.FC = () => {
  const {
    loading,
    searchTerm,
    setSearchTerm,
    filterStatus,
    setFilterStatus,
    filterMethod,
    setFilterMethod,
    filterDate,
    setFilterDate,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    lookbackDays,
    floorDate,
    viewOpen,
    setViewOpen,
    viewLoading,
    viewPayment,
    viewOrder,
    filteredPayments,
    openView,
    stats,
    paymentMethods,
    page,
    setPage,
    pageSize,
    totalCount,
    totalPages
  } = usePaymentData();

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader
        title="Payments"
      />

      <PaymentStats stats={stats} />

      <PaymentFilters
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        filterMethod={filterMethod}
        setFilterMethod={setFilterMethod}
        filterDate={filterDate}
        setFilterDate={setFilterDate}
        customFrom={customFrom}
        setCustomFrom={setCustomFrom}
        customTo={customTo}
        setCustomTo={setCustomTo}
        lookbackDays={lookbackDays}
        floorDate={floorDate}
        paymentMethods={paymentMethods}
      />

      <PaymentsTable
        loading={loading}
        filteredPayments={filteredPayments}
        openView={openView}
        page={page}
        setPage={setPage}
        pageSize={pageSize}
        totalCount={totalCount}
        totalPages={totalPages}
      />

      <ViewPaymentDialog
        viewOpen={viewOpen}
        setViewOpen={setViewOpen}
        viewLoading={viewLoading}
        viewPayment={viewPayment}
        viewOrder={viewOrder}
      />
    </div>
  );
};

export default PaymentManagement;
