import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface SubReportsQuickActionsProps {
  handleCustomerAnalytics: () => void;
  handleInventoryReports: () => void;
  handlePerformanceMetrics: () => void;
}

/** More reports, as plain rows. */
export const SubReportsQuickActions: React.FC<SubReportsQuickActionsProps> = ({
  handleCustomerAnalytics,
  handleInventoryReports,
  handlePerformanceMetrics
}) => {
  const rows = [
    { title: 'Customers', text: 'Who comes back and their average bill.', onClick: handleCustomerAnalytics },
    { title: 'Stock usage', text: 'Stock levels and how fast ingredients go.', onClick: handleInventoryReports },
    { title: 'Service speed', text: 'Wait times, waiter speed and orders per hour.', onClick: handlePerformanceMetrics },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border">
        <CardTitle>More reports</CardTitle>
        <CardDescription>Deeper looks at the business.</CardDescription>
      </CardHeader>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.title}>
            <button
              type="button"
              onClick={r.onClick}
              className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-row-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span>
                <span className="block font-semibold text-foreground">{r.title}</span>
                <span className="block text-sm text-muted-foreground">{r.text}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
};

export default SubReportsQuickActions;
