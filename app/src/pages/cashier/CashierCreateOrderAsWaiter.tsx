import React from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { formatOrderNumber } from '@/lib/utils';

// Hooks
import { useCashierCreateOrder } from './hooks/useCashierCreateOrder';

// Components
import CreateOrderHeader from './components/CreateOrder/CreateOrderHeader';
import OrderFiltersPanel from './components/CreateOrder/OrderFiltersPanel';
import WaiterCartSidebar from './components/CreateOrder/WaiterCartSidebar';
import MobileCartDialog from './components/CreateOrder/MobileCartDialog';
import MenuItemCard from './components/CreateOrder/MenuItemCard';
import { formatETB } from '@/lib/format';

import EmptyState from '@/components/common/EmptyState';
const CashierCreateOrderAsWaiter = () => {
  const navigate = useNavigate();
  const [isMobileSummaryOpen, setIsMobileSummaryOpen] = React.useState(false);
  const formatCurrency = formatETB;
  const getOrderRoutingInfo = React.useCallback(() => null, []);
  const {
    loading,
    filteredItems,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedMainCategory,
    setSelectedMainCategory,
    creatingOrder,
    selectedTable,
    setSelectedTable,
    deliveryMethods,
    selectedDeliveryMethodId,
    setSelectedDeliveryMethodId,
    selectedDeliveryMethodName,
    orderItems,
    notes,
    setNotes,
    allTables,
    isOnline,
    waiterName,
    deliveryMode,
    mappedMainCategories,
    mappedSubCategories,
    mainFilteredCount,
    isFastingCategory,
    addToOrder,
    removeFromOrder,
    updateQuantity,
    updateItemNote,
    calculateTotal,
    handleSubmitOrder,
    forceTableSelection,
    isAddMode,
    existingOrder,
  } = useCashierCreateOrder();

  const totalItemsCount = mappedMainCategories.reduce((sum, c) => sum + c.count, 0);
  const trimmedSearchQuery = searchQuery.trim();

  if (loading) return <LoadingSpinner text="Loading the menu…" />;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <CreateOrderHeader
        waiterName={waiterName}
        deliveryMode={deliveryMode}
        isOnline={isOnline}
        onNavigateToWaiters={() => navigate('/dashboard/cashier/select-waiter')}
        onNavigateToDashboard={() => navigate('/dashboard')}
      />

      {isAddMode && (
        <div className="mx-4 mt-3 rounded-xl bg-highlight/50 px-4 py-2.5 text-sm text-foreground sm:mx-6">
          Adding to <span className="font-semibold">{formatOrderNumber(existingOrder)}</span>
          {existingOrder?.table_number ? ` · Table ${existingOrder.table_number}` : ''}
        </div>
      )}

      <div className="mx-auto flex min-h-0 w-full max-w-full flex-1 flex-col gap-6 overflow-hidden px-4 pb-24 pt-4 sm:px-6 lg:flex-row lg:pb-5">
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <OrderFiltersPanel
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Search the menu"
            allTables={allTables}
            selectedTable={selectedTable}
            onSelectTable={setSelectedTable}
            deliveryMethods={deliveryMethods}
            selectedDeliveryMethodId={selectedDeliveryMethodId}
            onSelectDeliveryMethod={setSelectedDeliveryMethodId}
            selectedMainCategory={selectedMainCategory}
            onSelectMainCategory={(cat) => {
              setSelectedMainCategory(cat);
              setSelectedCategory('all');
            }}
            mainCategories={mappedMainCategories}
            totalItemsCount={totalItemsCount}
            selectedSubCategory={selectedCategory}
            onSelectSubCategory={setSelectedCategory}
            subCategories={mappedSubCategories}
            totalSubItemsCount={mainFilteredCount}
            showSubCategories={isFastingCategory(selectedMainCategory)}
            forceTableSelection={forceTableSelection}
          />

          <section className="flex min-h-0 flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {trimmedSearchQuery
                  ? `${filteredItems.length} ${filteredItems.length === 1 ? 'match' : 'matches'} for “${trimmedSearchQuery}”`
                  : `${filteredItems.length} ${filteredItems.length === 1 ? 'item' : 'items'}`}
              </p>
              {trimmedSearchQuery ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setSearchQuery('')}>
                  Clear search
                </Button>
              ) : null}
            </div>

            {filteredItems.length === 0 ? (
              <EmptyState
                className="rounded-card border border-dashed border-border"
                title={trimmedSearchQuery ? 'Nothing on the menu matches that' : 'No items in this category'}
                description={trimmedSearchQuery ? 'Try another word, or clear the search.' : 'Pick another category above.'}
              />
            ) : (
              <div className="grid min-h-0 grid-cols-2 content-start gap-3 overflow-auto pb-1 sm:grid-cols-3 xl:grid-cols-4">
                {filteredItems.map((item) => (
                  <MenuItemCard key={item.id} item={item} onAddToCart={addToOrder} />
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="hidden min-h-0 lg:flex lg:w-96 lg:flex-col">
          <WaiterCartSidebar
            orderItems={orderItems}
            selectedTable={selectedTable}
            selectedDeliveryMethodName={selectedDeliveryMethodName}
            creatingOrder={creatingOrder}
            onUpdateQuantity={updateQuantity}
            onRemoveFromOrder={removeFromOrder}
            onUpdateItemNote={updateItemNote}
            onSubmitOrder={handleSubmitOrder}
            calculateTotal={calculateTotal}
            getOrderRoutingInfo={getOrderRoutingInfo}
            formatCurrency={formatCurrency}
            forceTableSelection={forceTableSelection}
            notes={notes}
            onNotesChange={setNotes}
          />
        </div>
      </div>

      <MobileCartDialog
        open={isMobileSummaryOpen}
        onOpenChange={setIsMobileSummaryOpen}
        orderItems={orderItems}
        selectedTable={selectedTable}
        selectedDeliveryMethodName={selectedDeliveryMethodName}
        creatingOrder={creatingOrder}
        onUpdateQuantity={updateQuantity}
        onRemoveFromOrder={removeFromOrder}
        onUpdateItemNote={updateItemNote}
        onSubmitOrder={handleSubmitOrder}
        calculateTotal={calculateTotal}
        getOrderRoutingInfo={getOrderRoutingInfo}
        formatCurrency={formatCurrency}
        forceTableSelection={forceTableSelection}
        notes={notes}
        onNotesChange={setNotes}
      />
    </div>
  );
};

export default CashierCreateOrderAsWaiter;
