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

// Readable label for a stored key: 'dine_in' → 'Dine-in', 'cbe_birr' → 'CBE Birr'.
// Keep this map the same in web/lib/format.ts and app/src/lib/format.ts.
const KNOWN_LABELS: Record<string, string> = {
  // Order types
  dine_in: 'Dine-in',
  'dine-in': 'Dine-in',
  take_away: 'Takeaway',
  takeaway: 'Takeaway',
  take_out: 'Takeaway',
  delivery: 'Delivery',
  // Payment methods
  cash: 'Cash',
  card: 'Card',
  bank: 'Bank',
  bank_transfer: 'Bank transfer',
  mobile_money: 'Mobile money',
  cbe_birr: 'CBE Birr',
  cbe: 'CBE',
  telebirr: 'telebirr',
  pos: 'Card machine',
  credit: 'On credit',
  org_credit: 'Company account',
  organization: 'Company account',
  unreconciled: 'Not checked yet',
  // Statuses
  pending: 'Waiting',
  done: 'Done',
  ready: 'Ready',
  served: 'Served',
  paid: 'Paid',
  completed: 'Done',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
  voided: 'Cancelled',
  void: 'Cancelled',
  refunded: 'Refunded',
  deleted: 'Deleted',
  sent: 'Sent',
  received: 'Received',
  delivered: 'Delivered',
  approved: 'Approved',
  rejected: 'Rejected',
  active: 'Active',
  inactive: 'Not active',
  suspended: 'Paused',
  revoked: 'Removed',
  enrolled: 'Set up',
  in_stock: 'In stock',
  low: 'Low stock',
  low_stock: 'Low stock',
  out: 'Out of stock',
  out_of_stock: 'Out of stock',
  // Stock history (stock_movements.movement_type)
  initial: 'Starting stock',
  adjustment: 'Stock count change',
  transfer_in: 'Moved in',
  transfer_out: 'Moved out',
  sale: 'Used by order',
  order_deduction: 'Used by order',
  sale_reversal: 'Order cancelled, stock returned',
  waste: 'Thrown away',
  purchase: 'Bought',
  restock: 'Restocked',
  // Stock places (stock_locations.location_type)
  storage: 'Store room',
  prep_station: 'Prep area',
  retail: 'Shop shelf',
  cold_storage: 'Fridge / cold room',
  // Menu item types
  food: 'Food',
  beverage: 'Drink',
  // Roles
  cafe_waiter: 'Waiter',
  cafe_cashier: 'Cashier',
  fb_manager: 'Food & drinks manager',
  kitchen_staff: 'Kitchen',
  business_admin: 'Owner',
  super_admin: 'Platform admin',
  // Activity history (platform_audit_logs.action)
  'business.create': 'Business added',
  'business.update': 'Business changed',
  'business.delete': 'Business deleted',
  'business.suspend': 'Business paused',
  'business.activate': 'Business turned on',
  'branch.create': 'Branch added',
  'branch.update': 'Branch changed',
  'branch.delete': 'Branch deleted',
  'user.create': 'User added',
  'user.update': 'User changed',
  'user.delete': 'User deleted',
  'user.impersonate': 'Signed in as owner',
  'user.reset_password': 'Password reset',
};

export function humanize(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const known = KNOWN_LABELS[raw.toLowerCase()];
  if (known) return known;
  const text = raw.replace(/[_.-]+/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
