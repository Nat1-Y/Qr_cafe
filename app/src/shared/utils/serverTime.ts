// Local-time helpers.
//
// The app uses the local computer's clock and date directly. The previous
// "approximate server time" mechanism — which synced an offset from the backend
// and applied it to every timestamp — was removed. That offset could push a
// till's notion of "now"/"today" onto the wrong calendar day whenever the
// machine clock drifted from the server, which zeroed out day-scoped stats
// (e.g. the cashier "Today's Revenue" card).
//
// These functions are kept (as thin wrappers over `Date`) so existing call
// sites keep working without changes; they now always reflect the local clock.

export const getApproximateServerNow = (): number => Date.now();

export const getApproximateServerDate = (): Date => new Date();

export const getApproximateServerIsoString = (): string =>
  new Date().toISOString();

// Local calendar date as YYYY-MM-DD (built from the local clock, not UTC, so it
// never drifts a day around midnight the way `toISOString().split("T")[0]` would).
export const getApproximateServerDateString = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
