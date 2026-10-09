import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer, RefreshCw, Settings2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/layout/PageHeader';
import { cn } from '@/lib/utils';

interface HeaderBannerProps {
  businessUnit: string;
  setBusinessUnit: (unit: string) => void;
  selectedMenuItemId: string;
  setSelectedMenuItemId: (id: string) => void;
  menuItemsForSelectedUnit: any[];
  mainCategories?: Array<{ name: string; slug: string }>;
  qzStatus: any;
  syncStatus: any;
  onManualSync: () => void;
  onTestPrint: () => void;
  /** Orders currently waiting for payment, for the context line. */
  waitingCount?: number;
}

const todayLabel = () =>
  new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/** Small status dot + label, e.g. "Printer ready". */
const Signal: React.FC<{ tone: 'ok' | 'warn' | 'bad'; children: React.ReactNode }> = ({ tone, children }) => (
  <span className="inline-flex items-center gap-1.5 text-meta text-muted-foreground">
    <span
      className={cn(
        'h-2 w-2 rounded-full',
        tone === 'ok' ? 'bg-success' : tone === 'warn' ? 'bg-warning' : 'bg-destructive'
      )}
    />
    {children}
  </span>
);

export const HeaderBanner: React.FC<HeaderBannerProps> = ({
  qzStatus,
  syncStatus,
  onManualSync,
  onTestPrint,
  waitingCount,
}) => {
  const navigate = useNavigate();
  const context = [
    todayLabel(),
    waitingCount != null ? `${waitingCount} waiting for payment` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-3">
      <PageHeader
        title="Till"
        description={context}
        actions={
          <>
            {syncStatus.online && (
              <Button
                variant="outline"
                onClick={onManualSync}
                disabled={syncStatus.syncing || !syncStatus.online}
              >
                <RefreshCw className={cn(syncStatus.syncing && 'animate-spin')} />
                {syncStatus.syncing
                  ? 'Syncing…'
                  : `Sync now${syncStatus.unsyncedCount > 0 ? ` (${syncStatus.unsyncedCount})` : ''}`}
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate('/dashboard/cashier/employees')}>
              <Users />
              Waiters
            </Button>
            <Button variant="ghost" size="icon" onClick={onTestPrint} title="Test print" aria-label="Test print">
              <Printer />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard/cashier/printer-settings')}
              title="Printer settings"
              aria-label="Printer settings"
            >
              <Settings2 />
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Signal tone="ok">Auto-print on</Signal>
        <Signal tone={qzStatus.connected ? 'ok' : 'warn'}>
          {qzStatus.connected ? 'Printer ready' : 'Printer offline'}
        </Signal>
        <Signal tone={syncStatus.online ? 'ok' : 'bad'}>{syncStatus.online ? 'Online' : 'Offline'}</Signal>
        {syncStatus.unsyncedCount > 0 && (
          <Signal tone="warn">{syncStatus.unsyncedCount} not synced yet</Signal>
        )}
      </div>
    </div>
  );
};
