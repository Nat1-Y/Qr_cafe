import { useEffect, useState } from "react";
import api from "@/application";
import { useAuth } from "@/context/AuthContext";
import { syncEngine } from "@/infrastructure/sync/sync-engine";

// Current user's history lookback in days (null = unlimited).
//
// Prefers the value mirrored into the local `system_settings` table (refreshed
// every sync loop via settings_pull), falling back to the value the login
// response provided until the first settings sync lands. Re-resolves after each
// sync cycle so an owner's change to the per-role window takes effect on the POS
// without the cashier logging out and back in.
export const useHistoryLookbackDays = (): number | null => {
  const { user } = useAuth();
  const role = user?.role ?? null;
  const loginValue =
    typeof user?.history_lookback_days === "number"
      ? user.history_lookback_days
      : null;

  const [days, setDays] = useState<number | null>(loginValue);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      try {
        const local = await api.settings.getLocalHistoryLookbackDays(role);
        if (cancelled) return;
        // undefined = the setting hasn't synced yet → keep the login value.
        setDays(local === undefined ? loginValue : local);
      } catch {
        if (!cancelled) setDays(loginValue);
      }
    };

    void resolve();
    // subscribe fires once immediately and again after every sync cycle.
    const unsubscribe = syncEngine.subscribe(() => {
      void resolve();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [role, loginValue]);

  return days;
};

export default useHistoryLookbackDays;
