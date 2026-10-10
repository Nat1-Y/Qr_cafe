import { WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSyncOnline } from '@/hooks/useSyncOnline';

interface OfflineBannerProps {
  /**
   * Live connectivity flag (e.g. `syncStatus.online` from the sync engine).
   * Omit it to let the banner subscribe to the sync engine itself.
   */
  online?: boolean;
  /** Optional override for the message shown while offline. */
  message?: string;
  className?: string;
}

/**
 * Shown on admin management pages when the device is offline. Admin actions
 * (create/edit/delete) are online-only — there is no local queue for them — so
 * the matching write controls are disabled while this banner is visible. Admins
 * can still view the cached data read-only.
 */
const OfflineBanner = ({ online, message, className }: OfflineBannerProps) => {
  const liveOnline = useSyncOnline();
  const isOnline = online ?? liveOnline;
  if (isOnline) return null;

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-warning',
        className,
      )}
    >
      <WifiOff className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="text-sm">
        <p className="font-medium">No internet</p>
        <p className="text-warning/90">
          {message ??
            'You can still look at everything. Connect to the internet to make changes.'}
        </p>
      </div>
    </div>
  );
};

export default OfflineBanner;
