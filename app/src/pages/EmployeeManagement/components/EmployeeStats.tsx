import React from 'react';
import { Users, DollarSign, TrendingDown } from 'lucide-react';
import StatsCard from '@/components/common/StatsCard';
import { formatETB } from '@/lib/format';


interface EmployeeStatsProps {
  activeSummary: any;
}

export const EmployeeStats: React.FC<EmployeeStatsProps> = ({ activeSummary }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatsCard
        title="Orders Total"
        value={`${formatETB(activeSummary?.orders_total)}`}
        subtitle={`${activeSummary?.orders_count ?? 0} orders`}
        icon={<Users className="h-5 w-5" />}
        variant="default"
      />
      <StatsCard
        title="Paid Total"
        value={`${formatETB(activeSummary?.paid_total)}`}
        subtitle={`${activeSummary?.payments_count ?? 0} payments`}
        icon={<DollarSign className="h-5 w-5" />}
        variant="success"
      />
      <StatsCard
        title="Unpaid Total"
        value={`${formatETB(activeSummary?.unpaid_total)}`}
        subtitle="Unpaid balance"
        icon={<TrendingDown className="h-5 w-5" />}
        variant="destructive"
      />
    </div>
  );
};

export default EmployeeStats;
