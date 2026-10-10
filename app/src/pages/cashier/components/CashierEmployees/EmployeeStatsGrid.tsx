import React from 'react';
import { Clipboard, CheckCircle, Coffee, DollarSign } from 'lucide-react';
import StatsCard from '@/components/common/StatsCard';

interface Stats {
  ordersCreated: number;
  ordersServed: number;
  totalRevenue: number;
  pendingBalance: number;
}

interface EmployeeStatsGridProps {
  stats: Stats;
  formatCurrency: (val: any) => string;
}

export const EmployeeStatsGrid: React.FC<EmployeeStatsGridProps> = ({
  stats,
  formatCurrency
}) => {
  const cards = [
    {
      title: 'Orders taken',
      value: stats.ordersCreated,
      icon: Clipboard,
    },
    {
      title: 'Orders paid',
      value: stats.ordersServed,
      icon: CheckCircle,
    },
    {
      title: 'Total money in',
      value: formatCurrency(stats.totalRevenue),
      icon: Coffee,
    },
    {
      title: 'Still owed',
      value: formatCurrency(stats.pendingBalance),
      icon: DollarSign,
    }
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, idx) => (
        <StatsCard key={idx} title={card.title} value={card.value} />
      ))}
    </div>
  );
};
