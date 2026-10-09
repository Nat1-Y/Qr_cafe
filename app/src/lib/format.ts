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
