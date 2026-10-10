"use client";

import { useRouter } from "next/navigation";
import LoadingSpinner from "@/components/waiter/LoadingSpinner";

import { Button } from "@/components/ui/button";
import { formatOrderNumber } from "@/lib/utils";

import { useWaiterCreateOrder } from "@/components/waiter/create-order/useWaiterCreateOrder";
import OrderFiltersPanel from "@/components/waiter/create-order/OrderFiltersPanel";
import WaiterHeader from "@/components/waiter/create-order/WaiterHeader";
import WaiterCartSidebar from "@/components/waiter/create-order/WaiterCartSidebar";
import MobileCartDialog from "@/components/waiter/create-order/MobileCartDialog";
import MenuItemCard from "@/components/waiter/create-order/MenuItemCard";

import { EmptyState } from "@/components/empty-state";
export default function CreateOrderPage() {
  const router = useRouter();
  const {
    loading,
    isAddMode,
    existingOrder,
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
    isMobileSummaryOpen,
    setIsMobileSummaryOpen,
    mappedMainCategories,
    mappedSubCategories,
    mainFilteredCount,
    isFastingCategory,
    addToOrder,
    removeFromOrder,
    updateQuantity,
    updateItemNote,
    calculateTotal,
    getOrderRoutingInfo,
    handleSubmitOrder,
    handleLogout,
    formatCurrency,
    forceTableSelection,
    showAvailability,
    availabilityByItem,
    stockFilter,
    setStockFilter,
    outOfStockCount,
  } = useWaiterCreateOrder();

  if (loading) return <LoadingSpinner text="Loading the menu…" />;

  const totalItemsCount = mappedMainCategories.reduce(
    (sum, c) => sum + c.count,
    0,
  );
  const trimmedSearchQuery = searchQuery.trim();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <WaiterHeader
        onLogout={handleLogout}
        onNavigateToHistory={() => router.push("/waiter/order-history")}
        onNavigateToDashboard={() => router.push("/waiter")}
      />

      {isAddMode && (
        <div className="mx-4 mt-3 rounded-xl bg-highlight/50 px-4 py-2.5 text-sm text-foreground sm:mx-6">
          {existingOrder ? (
            <>
              Adding to <span className="font-semibold">{formatOrderNumber(existingOrder)}</span>
              {existingOrder?.table_number ? ` · Table ${existingOrder.table_number}` : ""}
            </>
          ) : (
            "Adding to an existing order"
          )}
        </div>
      )}

      <div className="mx-auto flex min-h-0 w-full max-w-full flex-1 flex-col gap-6 overflow-hidden px-4 pt-4 pb-28 sm:px-6 lg:flex-row lg:pb-5">
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
              setSelectedCategory("all");
            }}
            mainCategories={mappedMainCategories}
            totalItemsCount={totalItemsCount}
            selectedSubCategory={selectedCategory}
            onSelectSubCategory={setSelectedCategory}
            subCategories={mappedSubCategories}
            totalSubItemsCount={mainFilteredCount}
            showSubCategories={isFastingCategory(selectedMainCategory)}
            forceTableSelection={forceTableSelection}
            showStockFilter={showAvailability && outOfStockCount > 0}
            stockFilterActive={stockFilter === "out"}
            onToggleStockFilter={() =>
              setStockFilter(stockFilter === "out" ? "all" : "out")
            }
            outOfStockCount={outOfStockCount}
          />

          <section className="flex min-h-0 flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {trimmedSearchQuery
                  ? `${filteredItems.length} ${filteredItems.length === 1 ? "match" : "matches"} for “${trimmedSearchQuery}”`
                  : `${filteredItems.length} ${filteredItems.length === 1 ? "item" : "items"}`}
              </p>
              {trimmedSearchQuery ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
                  Clear search
                </Button>
              ) : null}
            </div>

            {filteredItems.length === 0 ? (
              <EmptyState
                className="rounded-card border border-dashed border-border"
                title={trimmedSearchQuery ? "Nothing on the menu matches that" : "No items in this category"}
                description={trimmedSearchQuery ? "Try another word, or clear the search." : "Pick another category above."}
              />
            ) : (
              <div className="grid min-h-0 grid-cols-2 content-start gap-3 overflow-auto pb-1 sm:grid-cols-3 xl:grid-cols-4">
                {filteredItems.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    onAddToCart={addToOrder}
                    availability={
                      showAvailability
                        ? availabilityByItem[String(item.id)]
                        : undefined
                    }
                  />
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
}
