// Per-device storage for the guest app. Private windows, blocked site data or
// a full quota can make localStorage throw or come back empty — every access is
// guarded, and the app works (just without memory) when storage is unavailable.

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable — keep going in memory.
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Keys are per table token, so two tables on one phone never mix carts. */
export const storageKeys = {
  session: (token: string) => `buna.qr.session.${token}`,
  cart: (token: string) => `buna.qr.cart.${token}`,
  pending: (token: string) => `buna.qr.pending.${token}`,
  lang: "buna.lang",
};
