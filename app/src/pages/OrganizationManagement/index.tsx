import React from 'react';
import { Plus, Building2, RefreshCw, List, ClipboardCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrganizationData } from './hooks/useOrganizationData';
import { useCreditManagement } from './hooks/useCreditManagement';
import { OrganizationsTable } from './components/OrganizationsTable';
import { AddPaymentTab } from './components/AddPaymentTab';
import { RecordTransactionTab } from './components/RecordTransactionTab';
import { TransactionHistoryTab } from './components/TransactionHistoryTab';
import { PaymentListTab } from './components/PaymentListTab';
import { OrganizationDialog } from './components/OrganizationDialog';
import { OrganizationOrders } from './OrganizationOrders';

export const OrganizationManagement: React.FC = () => {
  const { user } = useAuth() as any;
  const isAdmin = user?.role === 'admin';

  const {
    orgs,
    loading,
    dialogOpen,
    setDialogOpen,
    selected,
    form,
    setForm,
    saving,
    load,
    openAdd,
    openEdit,
    handleSubmit,
    handleDeactivate,
  } = useOrganizationData();

  const creditData = useCreditManagement(orgs);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <PageHeader title="Organizations" />
        <Card className="mt-6"><CardContent className="py-10 text-center text-muted-foreground">Admin access required.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader title="Organizations" description="Companies that order on credit, and what they owe." actions={
        <Button onClick={load} variant="outline" size="sm"><RefreshCw />Refresh</Button>
      } />

      <Tabs defaultValue="organizations" className="space-y-5">
        <div className="overflow-x-auto rounded-md border bg-card p-1">
          <TabsList className="h-auto w-max min-w-full justify-start bg-transparent p-0">
            <TabsTrigger value="organizations" className="gap-2 rounded-md px-4 py-2.5 text-xs">
              <Building2 className="h-4 w-4" />Organizations
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2 rounded-md px-4 py-2.5 text-xs">
              <ClipboardCheck className="h-4 w-4" />Orders
            </TabsTrigger>
            <TabsTrigger value="add-payment" className="gap-2 rounded-md px-4 py-2.5 text-xs">
              Add payment
            </TabsTrigger>
            <TabsTrigger value="transactions" className="gap-2 rounded-md px-4 py-2.5 text-xs">
              Record transaction
            </TabsTrigger>
            <TabsTrigger value="payment-list" className="gap-2 rounded-md px-4 py-2.5 text-xs">
              <List className="h-4 w-4" />Payment list
            </TabsTrigger>
            <TabsTrigger value="transaction-history" className="gap-2 rounded-md px-4 py-2.5 text-xs">
              <RefreshCw className="h-4 w-4" />Transaction history
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── TAB 1: Organizations ── */}
        <TabsContent value="organizations" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openAdd}><Plus />Add organization</Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <OrganizationsTable
                orgs={orgs}
                loading={loading}
                onEdit={openEdit}
                onDeactivate={handleDeactivate}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: Orders — where the owner reviews and confirms
             organization-attributed orders. Confirming is what actually posts
             the credit deduction; the order carries organization_id from the
             moment a cashier/waiter attaches it, but nothing touches the
             organization's balance until it's confirmed here. ── */}
        <TabsContent value="orders">
          <OrganizationOrders organizations={orgs} />
        </TabsContent>

        {/* ── TAB 2: Add Payment ── */}
        <TabsContent value="add-payment">
          <AddPaymentTab
            orgs={orgs}
            payOrgId={creditData.payOrgId}
            setPayOrgId={creditData.setPayOrgId}
            payAmount={creditData.payAmount}
            setPayAmount={creditData.setPayAmount}
            payDate={creditData.payDate}
            setPayDate={creditData.setPayDate}
            payNotes={creditData.payNotes}
            setPayNotes={creditData.setPayNotes}
            paySubmitting={creditData.paySubmitting}
            onSubmit={() => creditData.handleAddPayment(load)}
          />
        </TabsContent>

        {/* ── TAB 3: Record Transaction ── */}
        <TabsContent value="transactions" className="space-y-4">
          <RecordTransactionTab
            orgs={orgs}
            txOrgId={creditData.txOrgId}
            setTxOrgId={creditData.setTxOrgId}
            txDate={creditData.txDate}
            setTxDate={creditData.setTxDate}
            txNotes={creditData.txNotes}
            setTxNotes={creditData.setTxNotes}
            txServices={creditData.txServices}
            txSubmitting={creditData.txSubmitting}
            txOrgPayments={creditData.txOrgPayments}
            txOrgTransactions={creditData.txOrgTransactions}
            txCreditBalance={creditData.txCreditBalance}
            openPaymentDetail={creditData.openPaymentDetail}
            setOpenPaymentDetail={creditData.setOpenPaymentDetail}
            addServiceRow={creditData.addServiceRow}
            removeServiceRow={creditData.removeServiceRow}
            updateServiceRow={creditData.updateServiceRow}
            txTotal={creditData.txTotal}
            onSubmit={() => creditData.handleAddTransaction(load)}
          />
        </TabsContent>

        {/* ── TAB 4: Payment List ── */}
        <TabsContent value="payment-list" className="space-y-4">
          <PaymentListTab
            orgs={orgs}
            selectedOrgId={creditData.paymentListOrgId}
            setSelectedOrgId={creditData.setPaymentListOrgId}
            payments={creditData.paymentListData?.payments || []}
            transactions={creditData.paymentListData?.transactions || []}
            loading={creditData.paymentListLoading}
          />
        </TabsContent>

        {/* ── TAB 5: Transaction History ── */}
        <TabsContent value="transaction-history" className="space-y-4">
          <TransactionHistoryTab
            orgs={orgs}
            historyOrgId={creditData.historyOrgId}
            setHistoryOrgId={creditData.setHistoryOrgId}
            historyPage={creditData.historyPage}
            setHistoryPage={creditData.setHistoryPage}
            historyLimit={creditData.historyLimit}
            historyLoading={creditData.historyLoading}
            historyData={creditData.historyData}
          />
        </TabsContent>
      </Tabs>

      {/* Create/Edit Organization Dialog */}
      <OrganizationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selected={selected}
        form={form}
        setForm={setForm}
        saving={saving}
        onSubmit={handleSubmit}
      />
    </div>
  );
};

export default OrganizationManagement;
