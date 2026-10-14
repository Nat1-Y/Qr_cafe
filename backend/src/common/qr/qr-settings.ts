// Per-branch QR self-ordering settings. Each one is its own system_settings
// key (same pattern as force_table_selection / show_menu_inventory_availability)
// so an unset key simply falls back to the default below — no migration needed.

export const QR_SETTING_KEYS = {
  enabled: "qr_ordering_enabled",
  requireCashierAccept: "qr_require_cashier_accept",
  showPrices: "qr_show_prices",
  allowNotes: "qr_allow_notes",
  welcomeMessage: "qr_welcome_message",
  maxItemsPerOrder: "qr_max_items_per_order",
  orderingHours: "qr_ordering_hours",
  autoPrint: "qr_auto_print",
} as const;

/** Opening window in branch-local time, "HH:MM". Closes past midnight if close < open. */
export interface QrOrderingHours {
  open: string;
  close: string;
}

export interface QrSettings {
  enabled: boolean;
  requireCashierAccept: boolean;
  showPrices: boolean;
  allowNotes: boolean;
  welcomeMessage: string;
  maxItemsPerOrder: number;
  orderingHours: QrOrderingHours | null;
  autoPrint: boolean;
}

export const QR_SETTING_DEFAULTS: QrSettings = {
  // Off until the owner turns it on: printed QR cards shouldn't start taking
  // orders the moment this ships.
  enabled: false,
  requireCashierAccept: false,
  showPrices: true,
  allowNotes: true,
  welcomeMessage: "",
  maxItemsPerOrder: 30,
  orderingHours: null,
  autoPrint: true,
};

export const QR_MAX_ITEMS_LIMIT = 100;
export const QR_WELCOME_MESSAGE_MAX = 280;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseBool(raw: string | null | undefined, fallback: boolean): boolean {
  if (raw == null) return fallback;
  return raw === "true";
}

export function parseOrderingHours(raw: string | null | undefined): QrOrderingHours | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<QrOrderingHours> | null;
    if (v && typeof v.open === "string" && typeof v.close === "string" && HHMM.test(v.open) && HHMM.test(v.close)) {
      return { open: v.open, close: v.close };
    }
  } catch {
    // fall through
  }
  return null;
}

export function parseMaxItems(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return QR_SETTING_DEFAULTS.maxItemsPerOrder;
  return Math.min(n, QR_MAX_ITEMS_LIMIT);
}

/** Build the typed settings from raw system_settings rows (key → value). */
export function parseQrSettings(rows: Record<string, string | null | undefined>): QrSettings {
  const d = QR_SETTING_DEFAULTS;
  return {
    enabled: parseBool(rows[QR_SETTING_KEYS.enabled], d.enabled),
    requireCashierAccept: parseBool(rows[QR_SETTING_KEYS.requireCashierAccept], d.requireCashierAccept),
    showPrices: parseBool(rows[QR_SETTING_KEYS.showPrices], d.showPrices),
    allowNotes: parseBool(rows[QR_SETTING_KEYS.allowNotes], d.allowNotes),
    welcomeMessage: String(rows[QR_SETTING_KEYS.welcomeMessage] ?? "").slice(0, QR_WELCOME_MESSAGE_MAX),
    maxItemsPerOrder: parseMaxItems(rows[QR_SETTING_KEYS.maxItemsPerOrder]),
    orderingHours: parseOrderingHours(rows[QR_SETTING_KEYS.orderingHours]),
    autoPrint: parseBool(rows[QR_SETTING_KEYS.autoPrint], d.autoPrint),
  };
}

/** Is `now` (minutes since local midnight) inside the window? Handles overnight windows. */
export function isWithinOrderingHours(hours: QrOrderingHours | null, minutesNow: number): boolean {
  if (!hours) return true;
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const open = toMin(hours.open);
  const close = toMin(hours.close);
  if (open === close) return true;
  return open < close
    ? minutesNow >= open && minutesNow < close
    : minutesNow >= open || minutesNow < close;
}
