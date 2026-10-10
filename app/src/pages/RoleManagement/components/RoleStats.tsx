import React from 'react';
import StatsCard from '@/components/common/StatsCard';
import { Role } from '../types';

interface RoleStatsProps {
  roles: Role[];
}

export const RoleStats: React.FC<RoleStatsProps> = ({ roles }) => {
  const activeCount = roles.filter(r => r.is_active).length;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <StatsCard title="Roles" value={roles.length} />
      <StatsCard title="Active" value={activeCount} variant="success" />
      <StatsCard title="Added by you" value={roles.filter(r => r.name !== 'admin' && r.name !== 'cashier').length} />
    </div>
  );
};
