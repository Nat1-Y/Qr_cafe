import { syncEngine } from '@/infrastructure/sync/sync-engine';
import { startRealtimeSync } from '@/infrastructure/realtime/realtime-sync';
import { recoverOrphanedLocalPayments } from '@/infrastructure/adapters/payments.adapter';

export const startSyncServices = (): void => {
  if (typeof window !== 'undefined') {
    (window as any).triggerSync = () => syncEngine.sync();
  }
  // Repair any order this device itself flipped to "paid" with no local
  // payment behind it (e.g. an app kill mid-settlement on an older build,
  // before atomic_upsert_rows) before the first push, so it never syncs a
  // naked paid order upstream. Local-only, so it can't block startup on the
  // network — fire-and-log rather than await.
  void recoverOrphanedLocalPayments()
    .then(({ recovered }) => {
      if (recovered > 0) {
        console.warn(`[Recovery] Backfilled ${recovered} orphaned local payment(s) at startup.`);
      }
    })
    .catch((err) => console.error('[Recovery] Startup orphan-payment scan failed:', err));
  // Instant path: persist backend-pushed order changes into the local DB the
  // moment they happen (while online), app-wide.
  startRealtimeSync();
  // Safety net: keep pushing offline work and pulling latest states on an
  // interval so the app stays current without a manual "Sync" press.
  syncEngine.startAutoSync();
};

export { syncEngine };
