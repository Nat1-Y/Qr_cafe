import React from 'react';
import { Button } from '@/components/ui/button';
import { Calendar, Lock } from 'lucide-react';
import {
  getApproximateServerDate,
  getApproximateServerDateString,
} from '@/shared/utils/serverTime';

interface DateFilterProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  // Days of history this role may view (null = unlimited). Caps how many past
  // days are offered so a restricted role can't select outside its window.
  lookbackDays?: number | null;
}

export const DateFilter: React.FC<DateFilterProps> = ({ selectedDate, onDateChange, lookbackDays = null }) => {
  // How many past days to offer: capped at 6 for the unlimited case, and never
  // more than the role's lookback window when one is configured.
  const maxPastDays = lookbackDays == null ? 6 : Math.min(6, Math.max(0, lookbackDays));
  const restricted = lookbackDays != null;

  const getDateOptions = () => {
    const options = [];
    const today = getApproximateServerDate();

    options.push({ key: 'all', label: restricted ? 'All Visible' : 'All', date: null });
    const todayIso = getApproximateServerDateString();
    options.push({ key: 'today', label: 'Today', date: todayIso });

    for (let i = 1; i <= maxPastDays; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      options.push({
        key: dateStr,
        label: i === 1 ? 'Yesterday' : `${dayName}, ${monthDay}`,
        date: dateStr
      });
    }

    return options;
  };

  const windowLabel = restricted
    ? lookbackDays === 0
      ? 'Today only'
      : `Last ${lookbackDays + 1} days`
    : 'All history';

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
            <Calendar className="h-4 w-4" />
          </div>
          <h3 className="font-semibold text-sm">Date Filter</h3>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
          restricted ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-muted text-muted-foreground'
        }`}>
          {restricted && <Lock className="h-3 w-3" />}
          {windowLabel}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {getDateOptions().map((option) => (
          <Button
            key={option.key}
            variant={selectedDate === option.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => onDateChange(option.key)}
            className={`text-xs font-medium h-9 px-4 transition-all ${
              selectedDate === option.key
                ? 'shadow-sm ring-2 ring-primary/20'
                : 'hover:bg-muted hover:text-foreground'
            }`}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
};
