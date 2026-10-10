import React from 'react';
import { CreditCard, DollarSign, CheckCircle } from 'lucide-react';
import StatsCard from '@/components/common/StatsCard';
import { PaymentStats as StatsType } from '../types';

interface PaymentStatsProps {
  stats: StatsType;
}

export const PaymentStats: React.FC<PaymentStatsProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <StatsCard
        title="Not paid yet"
        value={stats.pendingCount}
        icon={<CreditCard className="h-5 w-5" />}
        variant="warning"
      />
      <StatsCard
        title="Money in today"
        value={stats.todayRevenue}
        icon={<DollarSign className="h-5 w-5" />}
        variant="success"
      />
  
      <StatsCard
        title="Paid"
        value={stats.completedCount}
        icon={<CheckCircle className="h-5 w-5" />}
        variant="success"
      />
    </div>
  );
};

export default PaymentStats;
