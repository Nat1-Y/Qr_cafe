"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Clipboard, CheckCircle, Coffee, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

import StatsCard from "@/components/waiter/StatsCard";
import { useWaiterAuth } from "@/components/waiter/auth-context";
import { useWaiterData } from "@/components/waiter/dashboard/useWaiterData";
import { useWaiterStats } from "@/components/waiter/dashboard/useWaiterStats";
import HeaderBanner from "@/components/waiter/dashboard/HeaderBanner";
import QuickActions from "@/components/waiter/dashboard/QuickActions";
import RecentOrdersPanel from "@/components/waiter/dashboard/RecentOrdersPanel";
import { Segmented } from "@/components/segmented";
import { formatETB } from "@/lib/format";

export default function WaiterDashboardPage() {
  const { user, logout } = useWaiterAuth();
  const router = useRouter();
  const [statsRange, setStatsRange] = useState("today");

  const { loading, dashboardData, attendanceStatus } = useWaiterData(user?.id);
  const { rangeOrders, stats } = useWaiterStats(
    dashboardData.myOrders,
    statsRange,
  );

  // Attendance has no backend module in the web deployment; surface a friendly
  // note rather than failing silently.
  const handleAttendanceUnavailable = () =>
    toast.message("Attendance / clock-in is handled in-store, not in the web portal.");

  const handleLogout = () => {
    logout();
    router.push("/waiter/login");
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
        <Skeleton className="h-16 w-64" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const statsCards = [
    { title: "Orders taken", value: stats.ordersCreated, variant: "default" as const },
    { title: "Served", value: stats.ordersServed, variant: "success" as const },
    { title: "Sales", value: formatETB(stats.totalRevenue), variant: "default" as const },
    { title: "Still to pay", value: formatETB(stats.pendingBalance), variant: "warning" as const },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <HeaderBanner
        userName={user?.full_name}
        attendanceStatus={attendanceStatus}
        onClockIn={handleAttendanceUnavailable}
        onClockOut={handleAttendanceUnavailable}
        onLogout={handleLogout}
      />

      <QuickActions
        onNewOrder={() => router.push("/waiter/create-order")}
        onOrderHistory={() => router.push("/waiter/order-history")}
        onViewMenu={() => router.push("/waiter/create-order")}
        onMyProfile={() => router.push("/waiter/profile")}
      />

      <section className="space-y-3">
        <Segmented
          aria-label="Time range"
          value={statsRange}
          onChange={(v) => setStatsRange(v)}
          options={[
            { value: "today", label: "Today" },
            { value: "yesterday", label: "Yesterday" },
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
            { value: "all", label: "All" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {statsCards.map((card, index) => (
            <StatsCard key={index} title={card.title} value={card.value} variant={card.variant} />
          ))}
        </div>
      </section>

      <RecentOrdersPanel orders={rangeOrders} />
    </div>
  );
}
