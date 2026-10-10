import React from 'react';
import StatsCard from '@/components/common/StatsCard';
import { StockLocation } from '../types';

interface LocationStatsProps {
  locations: StockLocation[];
}

export const LocationStats: React.FC<LocationStatsProps> = ({ locations }) => {
  const activeCount = locations.filter((location) => location.is_active).length;
  const defaultLocation = locations.find((location) => location.is_default);
  const prepStations = locations.filter(
    (location) => location.location_type === 'prep_station' && location.is_active,
  ).length;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatsCard title="Places in use" value={activeCount} />
      <StatsCard title="Main stock place" value={defaultLocation?.name || 'Not set'} />
      <StatsCard title="Prep areas" value={prepStations} />
    </div>
  );
};

export default LocationStats;
