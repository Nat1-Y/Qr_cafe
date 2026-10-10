import React from 'react';
import StatsCard from '@/components/common/StatsCard';

interface TableStatsProps {
  total: number;
  available: number;
}

export const TableStats: React.FC<TableStatsProps> = ({ total, available }) => {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatsCard title="Tables" value={total} />
      <StatsCard title="Free" value={available} variant="success" />
      <StatsCard title="Occupied" value={Math.max(0, total - available)} />
    </div>
  );
};
export default TableStats;
