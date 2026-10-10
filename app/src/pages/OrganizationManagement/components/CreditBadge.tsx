import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatETB } from '@/lib/format';


interface CreditBadgeProps {
  balance: number;
}

export const CreditBadge = ({ balance }: CreditBadgeProps) => {
  const isNeg = balance < 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${isNeg ? 'bg-destructive-soft text-destructive ' : 'bg-success-soft text-success '}`}>
      {isNeg ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
      {formatETB(Math.abs(balance))} {isNeg ? 'overdrawn' : 'credit'}
    </span>
  );
};
