import React from 'react';
import { CreditCard, DollarSign, Smartphone, Wifi } from 'lucide-react';
import StatsCard from '@/components/common/StatsCard';
import { PaymentMethod } from '../types';

const ICON_MAP: Record<string, React.ElementType> = {
  'dollar-sign': DollarSign,
  'credit-card': CreditCard,
  'square': Wifi,
  'smartphone': Smartphone,
};

interface PaymentMethodStatsProps {
  methods: PaymentMethod[];
}

export const PaymentMethodStats: React.FC<PaymentMethodStatsProps> = ({ methods }) => {
  const activeCount = methods.filter(m => m.is_active).length;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <StatsCard title="Payment types" value={methods.length} />
      <StatsCard title="On" value={activeCount} variant="success" />
      <StatsCard title="Off" value={methods.length - activeCount} />
    </div>
  );
};
