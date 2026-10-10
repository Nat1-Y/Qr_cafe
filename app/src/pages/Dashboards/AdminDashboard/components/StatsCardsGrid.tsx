import React from 'react';
import StatsCard from '@/components/common/StatsCard';
import { StatsCardData } from '../types';

interface StatsCardsGridProps {
  cards: StatsCardData[];
}

/** KPI row: small muted label, big number. */
export const StatsCardsGrid: React.FC<StatsCardsGridProps> = ({ cards }) => {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <StatsCard key={index} title={card.title} value={card.value} variant={card.variant === 'secondary' ? 'default' : card.variant} />
      ))}
    </div>
  );
};
