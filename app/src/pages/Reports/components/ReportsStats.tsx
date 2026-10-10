import React from 'react';
import { BarChart2, DollarSign, TrendingUp, Calendar } from 'lucide-react';
import StatsCard from '@/components/common/StatsCard';
import { ReportData } from '../types';
import { formatETB } from '@/lib/format';

interface ReportsStatsProps {
  reportData: ReportData;
}

export const ReportsStats: React.FC<ReportsStatsProps> = ({ reportData }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatsCard
        title="Today's orders"
        value={reportData.dailyStats.totalOrders}
        subtitle={`Cafe: ${reportData.dailyStats.cafeOrders} | Rest: ${reportData.dailyStats.restaurantOrders} | Bar: ${reportData.dailyStats.baristaOrders}`}
        icon={<BarChart2 className="w-5 h-5" />}
        variant="info"
      />
      <StatsCard
        title="Today's revenue"
        value={`${formatETB((reportData.dailyStats.paidRevenue || 0))}`}
        subtitle="Paid settlement orders only"
        icon={<DollarSign className="w-5 h-5" />}
        variant="success"
      />
      <StatsCard
        title="Weekly orders"
        value={reportData.weeklyStats.totalOrders}
        subtitle={`Avg paid: ${formatETB((reportData.weeklyStats.avgPaidOrderValue || 0))}`}
        icon={<TrendingUp className="w-5 h-5" />}
        variant="default"
      />
      <StatsCard
        title="Monthly growth"
        value={`${(reportData.monthlyStats.growth || 0) >= 0 ? '+' : ''}${(reportData.monthlyStats.growth || 0).toFixed(1)}%`}
        subtitle={`${formatETB((reportData.monthlyStats.paidRevenue || 0))} this month`}
        icon={<Calendar className="w-5 h-5" />}
        variant="warning"
      />
    </div>
  );
};

export default ReportsStats;
