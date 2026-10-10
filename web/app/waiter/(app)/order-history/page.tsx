"use client";

import React from "react";
import { useRouter } from "next/navigation";
import LoadingSpinner from "@/components/waiter/LoadingSpinner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, SearchInput } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import StatsCard from "@/components/waiter/StatsCard";

import { useWaiterOrderHistory } from "@/components/waiter/order-history/useWaiterOrderHistory";
import OrderHistoryHeader from "@/components/waiter/order-history/OrderHistoryHeader";
import OrderCard from "@/components/waiter/order-history/OrderCard";

export default function OrderHistoryPage() {
  const router = useRouter();
  const {
    loading,
    orders,
    filteredOrders,
    selectedDate,
    setSelectedDate,
    minDate,
    searchQuery,
    setSearchQuery,
    historyStats,
    additionsByOrderId,
    getEffectiveStatus,
    getStatusDisplay,
    formatDate,
    canAddItems,
    goAddItems,
    handleLogout,
    formatCurrency,
  } = useWaiterOrderHistory();

  if (loading) {
    return <LoadingSpinner text="Loading your orders…" />;
  }

  const setTodayPreset = () => {
    const today = new Date().toISOString().slice(0, 10);
    setSelectedDate(today);
  };

  const clearFilters = () => {
    setSelectedDate("");
    setSearchQuery("");
  };

  const isFiltered = selectedDate || searchQuery;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <OrderHistoryHeader
        totalOrdersCount={orders.length}
        onNewOrder={() => router.push("/waiter/create-order")}
        onLogout={handleLogout}
      />

      {orders.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatsCard title="Orders shown" value={historyStats.ordersCount} />
          <StatsCard title="Sales" value={formatCurrency(historyStats.revenue)} variant="success" className="order-last col-span-2 sm:order-none sm:col-span-1" />
          <StatsCard title="Tables still open" value={historyStats.activeTablesCount} />
        </div>
      )}

      {/* Filter bar */}
      {orders.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <SearchInput
              placeholder="Order number or table"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 pr-12"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="size-4" />
              </button>
            )}
          </div>
          <Input
            type="date"
            aria-label="Pick a date"
            value={selectedDate}
            min={minDate || undefined}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-12 sm:w-48"
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-12 flex-1 sm:flex-none" onClick={setTodayPreset}>
              Today
            </Button>
            {isFiltered && (
              <Button variant="ghost" className="h-12" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <EmptyState
          className="rounded-card border border-dashed border-border"
          title="No orders yet"
          description="Orders you take will show up here."
          action={
            <Button size="lg" onClick={() => router.push("/waiter/create-order")}>
              New order
            </Button>
          }
        />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          className="rounded-card border border-dashed border-border"
          title="No orders match"
          description="Try another number, or clear the date."
          action={
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              itemAdditions={additionsByOrderId[String(order.id)] || []}
              getEffectiveStatus={getEffectiveStatus}
              getStatusDisplay={getStatusDisplay}
              formatDate={formatDate}
              canAddItems={canAddItems}
              goAddItems={goAddItems}
              formatCurrency={formatCurrency}
            />
          ))}
        </div>
      )}
    </div>
  );
}
