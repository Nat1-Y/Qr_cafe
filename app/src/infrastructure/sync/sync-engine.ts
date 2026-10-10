import toast from "react-hot-toast";
import { syncTasks, type SyncTask, type SyncTaskResult } from "./tasks";
import { getSessionUser } from "@/shared/utils/sessionUser";
import {
  api as httpClient,
  FAST_PROBE_TIMEOUT_MS,
} from "@/infrastructure/api/http-client";

export type SyncStatusCallback = (status: {
  online: boolean;
  syncing: boolean;
  unsyncedCount: number;
}) => void;

export type SyncProgress = {
  /** Whether a sync cycle is currently running. */
  active: boolean;
  /** Number of tasks finished in the current cycle. */
  completed: number;
  /** Total tasks in the current cycle. */
  total: number;
  /** Name of the task currently running (for status display). */
  task?: string;
  /**
   * Background/automatic cycle (auto-sync tick, reconnect flush). The global
   * SyncProgressBar ignores these so routine background syncs don't flash the
   * "Syncing N%" bar in the header on every tick. Only foreground syncs
   * (manual "Sync" press, post-login hydration) drive the visible bar.
   */
  silent?: boolean;
};

export type SyncProgressCallback = (progress: SyncProgress) => void;

/**
 * Tasks that run automatically (e.g. right after login): the data the app needs
 * to be usable immediately — authentication (users/roles), menu, settings, and
 * today's orders (so the cashier sees orders created on other devices, like the
 * web waiter app). Everything else — payments, inventory, tables, organizations,
 * stock locations/transfers — is only pushed/pulled on an explicit manual
 * "Sync" button press.
 */
export const AUTO_SYNC_TASKS: readonly string[] = [
  "users_pull",
  "roles_pull",
  "menu_items_pull",
  "settings_pull",
  "orders",
  "orders_pull",
  "item_additions",
  "item_additions_pull",
  "expenses",
];

// Tasks run automatically when connectivity is restored mid-session: flush any
// offline-created orders/expenses/item-additions to the server, then reconcile
// today's list.
export const RECONNECT_SYNC_TASKS: readonly string[] = [
  "orders",
  "orders_pull",
  "item_additions",
  "item_additions_pull",
  "expenses",
];

class SimpleSyncEngine {
  private online: boolean =
    typeof navigator !== "undefined" ? navigator.onLine : true;
  private syncing = false;
  private readonly listeners = new Set<SyncStatusCallback>();
  private readonly progressListeners = new Set<SyncProgressCallback>();
  private progress: SyncProgress = { active: false, completed: 0, total: 0 };
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  // A single slow/failed health probe is common on a merely-bad (not dead)
  // connection and shouldn't flip the app-wide online flag — that would drop
  // the realtime order socket and gate admin writes off a false negative.
  // Only a run of consecutive failures is trusted as "actually offline".
  // Recovery is never debounced: the moment a probe succeeds we go back
  // online immediately.
  private consecutiveProbeFailures = 0;
  private static readonly OFFLINE_CONFIRM_THRESHOLD = 2;

  constructor() {
    this.setupListeners();
  }

  /**
   * Start polling the backend on an interval so the app stays current without
   * anyone pressing "Sync". Each tick re-checks connectivity (which flushes
   * offline work on the offline→online edge) and, while online and signed in,
   * pushes any unsynced orders/expenses and pulls the latest order states — so a
   * change made elsewhere (e.g. a web cashier cancelling an order) lands here on
   * its own. The realtime socket handles the instant path; this is the safety
   * net that guarantees eventual convergence and offline catch-up. Idempotent.
   */
  startAutoSync(intervalMs = 20_000): void {
    if (this.autoSyncTimer || typeof window === "undefined") return;
    this.autoSyncTimer = setInterval(() => {
      void this.autoSyncTick();
    }, intervalMs);
  }

  stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  private async autoSyncTick(): Promise<void> {
    // Nothing to sync until someone is signed in (avoid 401 spam pre-login).
    if (!getSessionUser()) return;
    if (this.syncing) return;
    try {
      // sync() verifies connectivity first and self-guards when offline, so a
      // tick while disconnected is a cheap no-op (and keeps the online badge
      // fresh). The realtime socket carries the instant path; this guarantees
      // eventual convergence and flushes anything queued offline.
      await this.sync(RECONNECT_SYNC_TASKS, { silent: true });
    } catch (error) {
      console.warn("[sync] Auto-sync tick failed", error);
    }
  }

  subscribe(callback: SyncStatusCallback): () => void {
    this.listeners.add(callback);
    void this.emitStatusFor(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Subscribe to fine-grained progress of the running sync cycle (task counts).
   * Emits the current snapshot immediately on subscribe. Kept separate from
   * `subscribe` so the lightweight progress ticks never trigger the expensive
   * unsynced-count recompute that `subscribe` listeners receive.
   */
  subscribeProgress(callback: SyncProgressCallback): () => void {
    this.progressListeners.add(callback);
    try {
      callback(this.progress);
    } catch (error) {
      console.error("[sync] Progress listener error", error);
    }
    return () => {
      this.progressListeners.delete(callback);
    };
  }

  private emitProgress(): void {
    this.progressListeners.forEach((listener) => {
      try {
        listener(this.progress);
      } catch (error) {
        console.error("[sync] Progress listener error", error);
      }
    });
  }

  notifyListeners(): void {
    void this.emitStatus();
  }

  async getUnsyncedCount(): Promise<number> {
    const counts = await Promise.all(
      syncTasks
        .map((task) => task.countUnsynced?.())
        .map(async (counter) => {
          try {
            return (await counter) ?? 0;
          } catch (error) {
            console.error("[sync] Failed to count unsynced records", error);
            return 0;
          }
        }),
    );
    return counts.reduce((acc, value) => acc + value, 0);
  }

  isAppOnline(): boolean {
    return this.online;
  }

  isSyncingInProgress(): boolean {
    return this.syncing;
  }

  async sync(
    targetTasks?: readonly string[],
    opts?: { silent?: boolean },
  ): Promise<boolean> {
    // Claim the sync lock synchronously so rapid double-clicks can't both slip
    // through before the (awaited) connection check sets `syncing`.
    if (this.syncing) {
      // console.log('[sync] A sync cycle is already running.');
      return false;
    }
    this.syncing = true;
    this.notifyListeners();

    const results: SyncTaskResult[] = [];

    try {
      // Only the cheap, trusted, instant signal gates the whole cycle. A
      // failed/slow health probe no longer does — each task below already
      // guards its own push/pull in a try/catch (see runTask), so a
      // genuinely unreachable backend just fails each task individually
      // instead of skipping the cycle outright on one flaky round trip.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        this.consecutiveProbeFailures = 0;
        this.setOnline(false);
        console.warn("[sync] Cannot start sync while offline.");
        return false;
      }
      void this.verifyConnection();

      const tasksToRun = targetTasks
        ? syncTasks.filter((task) => targetTasks.includes(task.name))
        : syncTasks;

      this.progress = {
        active: true,
        completed: 0,
        total: tasksToRun.length,
        silent: opts?.silent === true,
      };
      this.emitProgress();

      for (const task of tasksToRun) {
        this.progress = { ...this.progress, task: task.name };
        this.emitProgress();
        await this.runTask(task, results);
        this.progress = {
          ...this.progress,
          completed: this.progress.completed + 1,
        };
        this.emitProgress();
      }

      const pushed = results.reduce((sum, result) => sum + result.pushed, 0);
      if (pushed > 0 && !opts?.silent) {
        toast.success(`Sent ${pushed} update${pushed === 1 ? "" : "s"}.`, {
          id: "sync-success",
        });
      }

      return true;
    } catch (error) {
      console.error("[sync] Failed to complete sync cycle", error);
      if (!opts?.silent) toast.error("Couldn't send updates. Your work is saved and will send later.");
      return false;
    } finally {
      this.syncing = false;
      this.progress = {
        active: false,
        completed: this.progress.total,
        total: this.progress.total,
        silent: opts?.silent === true,
      };
      this.emitProgress();
      this.notifyListeners();
    }
  }

  notifyOnlineState(online: boolean): void {
    if (typeof window !== "undefined") {
      (window as any).isSyncOnline = online;
    }
  }

  async verifyConnection(): Promise<boolean> {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.consecutiveProbeFailures = 0;
      this.setOnline(false);
      return false;
    }

    try {
      const response = await httpClient.get("/health", {
        timeout: FAST_PROBE_TIMEOUT_MS,
      });
      const reachable =
        response?.status === 200 || response?.data?.status === "success";
      if (reachable) {
        this.consecutiveProbeFailures = 0;
        this.setOnline(true);
        return true;
      }
      this.reportProbeFailure();
      return this.online;
    } catch (error) {
      console.warn("[sync] Health probe failed", error);
      this.reportProbeFailure();
      return this.online;
    }
  }

  /** A probe failure only flips us offline once it's happened repeatedly in a
   * row — see `consecutiveProbeFailures` for why. */
  private reportProbeFailure(): void {
    this.consecutiveProbeFailures += 1;
    if (
      this.consecutiveProbeFailures >=
      SimpleSyncEngine.OFFLINE_CONFIRM_THRESHOLD
    ) {
      this.setOnline(false);
    }
  }

  private async runTask(
    task: SyncTask,
    results: SyncTaskResult[],
  ): Promise<void> {
    try {
      if (task.push) {
        const pushed = await task.push();
        results.push({ name: task.name, pushed });
      }
    } catch (error) {
      console.error(`[sync] Push task "${task.name}" failed`, error);
    }

    try {
      if (task.pull) {
        await task.pull();
      }
    } catch (error) {
      console.error(`[sync] Pull task "${task.name}" failed`, error);
    }
  }

  private setupListeners(): void {
    if (typeof window === "undefined") return;
    window.addEventListener("online", () => this.setOnline(true));
    window.addEventListener("offline", () => this.setOnline(false));
  }

  private setOnline(next: boolean): void {
    if (this.online === next) return;
    this.online = next;
    if (next) {
      toast.success("Internet is back. Sending your updates.", { id: "sync-online" });
      // Flush offline-created orders as soon as connectivity returns so they
      // can never be stranded locally. Fire-and-forget; sync() self-guards
      // against overlapping runs and re-verifies the connection.
      void this.sync(RECONNECT_SYNC_TASKS, { silent: true }).catch((error) =>
        console.warn("[sync] Reconnect order flush failed", error),
      );
    }
    this.notifyOnlineState(next);
    this.notifyListeners();
  }

  private async emitStatus(): Promise<void> {
    const unsyncedCount = await this.getUnsyncedCount();
    const snapshot = {
      online: this.online,
      syncing: this.syncing,
      unsyncedCount,
    };

    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("[sync] Listener error", error);
      }
    });
  }

  private async emitStatusFor(listener: SyncStatusCallback): Promise<void> {
    const unsyncedCount = await this.getUnsyncedCount();
    try {
      listener({ online: this.online, syncing: this.syncing, unsyncedCount });
    } catch (error) {
      console.error("[sync] Listener error", error);
    }
  }
}

export const syncEngine = new SimpleSyncEngine();
export default syncEngine;
