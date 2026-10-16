// Staff-side helpers for QR self-ordering: where table QR codes point, and the
// typed shapes of the owner's QR settings.

export interface QrSettings {
  enabled: boolean;
  requireCashierAccept: boolean;
  showPrices: boolean;
  allowNotes: boolean;
  welcomeMessage: string;
  maxItemsPerOrder: number;
  orderingHours: { open: string; close: string } | null;
  autoPrint: boolean;
}

export interface ProviderRow {
  id: string;
  name: string;
  available: boolean;
  enabled: boolean;
}

export interface SectionRouting {
  key: string;
  name: string;
  printer: string | null;
  routed: boolean;
}

export interface QrSettingsResponse {
  branch: { name: string; phone: string | null };
  settings: QrSettings;
  providers: ProviderRow[];
  sections: SectionRouting[];
}

export interface QrTable {
  id: string;
  table_number: number;
  status: string;
  label: string | null;
  qr_token: string;
  qr_enabled: boolean;
  qr_rotated_at: string | null;
  /** The waiter responsible for this table; QR orders are attributed to them. */
  assigned_waiter_id: string | null;
  assigned_waiter_name: string | null;
}

/**
 * The address guests' phones open. Set NEXT_PUBLIC_GUEST_BASE_URL to your
 * public web address (e.g. https://order.mycafe.et) so cards printed from any
 * computer point at the right place; otherwise the address this page was
 * opened from is used.
 */
export function guestBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_GUEST_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export function guestUrl(token: string): string {
  return `${guestBaseUrl()}/t/${token}`;
}

/** True when the QR would point at this computer only (phones can't open it). */
export function pointsAtLocalhost(): boolean {
  try {
    const host = new URL(guestBaseUrl()).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

/** Plain-language table name, e.g. "Table 7 · Terrace". */
export function tableTitle(t: Pick<QrTable, "table_number" | "label">): string {
  return t.label ? `Table ${t.table_number} · ${t.label}` : `Table ${t.table_number}`;
}
