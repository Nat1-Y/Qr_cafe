const wholeEtb = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const centsEtb = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// The one money formatter for screens: "18,420 ETB" or "517.50 ETB".
// Printed receipts keep their own configurable currency text.
export function formatETB(amount: unknown): string {
  const n = typeof amount === 'number' ? amount : Number.parseFloat(String(amount ?? 0));
  const value = Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  return `${(Number.isInteger(value) ? wholeEtb : centsEtb).format(value)} ETB`;
}

// Readable label for a stored key: "dine_in" → "Dine-in", "cbe_birr" → "CBE Birr".
const KNOWN_LABELS: Record<string, string> = {
  dine_in: 'Dine-in',
  'dine-in': 'Dine-in',
  take_away: 'Takeaway',
  takeaway: 'Takeaway',
  take_out: 'Takeaway',
  cbe_birr: 'CBE Birr',
  cbe: 'CBE',
  telebirr: 'telebirr',
  pos: 'POS',
  cafe_waiter: 'Waiter',
  cafe_cashier: 'Cashier',
  fb_manager: 'F&B manager',
};

export function humanize(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const known = KNOWN_LABELS[raw.toLowerCase()];
  if (known) return known;
  const text = raw.replace(/[_-]+/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
