import React from 'react';
import StatsCard from '@/components/common/StatsCard';
import { formatETB } from '@/lib/format';

interface OrderStatsProps {
  orders: any[];
  paidOrderIdSet: Set<string>;
}

export const OrderStats: React.FC<OrderStatsProps> = ({ orders, paidOrderIdSet }) => {
  const stats = React.useMemo(() => {
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => {
      const isPaid = paidOrderIdSet?.has(String(order.id)) || order.payment_status === 'paid';
      return isPaid ? sum + parseFloat(order.total_amount || 0) : sum;
    }, 0);
    
    const unpaidAmount = orders.reduce((sum, order) => {
      const isPaid = paidOrderIdSet?.has(String(order.id)) || order.payment_status === 'paid';
      return !isPaid ? sum + parseFloat(order.total_amount || 0) : sum;
    }, 0);

    const pendingOrders = orders.filter(order => order.status === 'pending').length;
    const completedOrders = orders.filter(order => order.status === 'done').length;

    return {
      totalOrders,
      totalRevenue,
      unpaidAmount,
      pendingOrders,
      completedOrders,
    };
  }, [orders, paidOrderIdSet]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatsCard title="Orders" value={stats.totalOrders} />
      <StatsCard title="Revenue" value={formatETB(stats.totalRevenue)} variant="success" />
      <StatsCard title="Pending" value={stats.pendingOrders} variant="warning" />
      <StatsCard title="Not paid yet" value={formatETB(stats.unpaidAmount)} variant="destructive" />
    </div>
  );
};


