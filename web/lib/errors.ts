// Turns any thrown error (fetch Error, axios error, rejected { message,
// response } object, or a plain string) into one short sentence a cafe worker
// can act on. Keep this file the same as app/src/lib/errors.ts.

export const ERROR_TEXT = {
  network: "No internet. Check the connection and try again.",
  permission: "You don't have permission to do this. Ask your manager.",
  notFound: "We couldn't find that. It may have been deleted.",
  server: "Something went wrong on our side. Please try again.",
  noStock: "Not enough stock for this item.",
  wrongLogin: "Wrong username, password or PIN. Please try again.",
  accountOff: "This account is turned off. Ask your manager.",
  checkForm: "Some details are missing. Check the form and try again.",
  generic: "Something went wrong. Please try again.",
} as const;

// Plain sentence for an HTTP status, or null when the status alone says nothing.
export function messageForStatus(status?: number | null): string | null {
  if (!status) return null;
  if (status === 408 || status === 504) return ERROR_TEXT.network;
  if (status === 401 || status === 403) return ERROR_TEXT.permission;
  if (status === 404) return ERROR_TEXT.notFound;
  if (status >= 500) return ERROR_TEXT.server;
  return null;
}

// Backend field names that leak into validation text → what to tell the user.
const FIELD_HINTS: Record<string, string> = {
  table_number: "Enter a table number.",
  table_id: "Choose a table.",
  menu_item_id: "Choose a menu item.",
  menu_item: "Choose a menu item.",
  employee_id: "Choose a staff member.",
  waiter_id: "Choose a staff member.",
  user_id: "Choose a staff member.",
  cashier_id: "Choose a staff member.",
  payment_method: "Choose how the customer paid.",
  payment_method_id: "Choose how the customer paid.",
  order_id: "Choose an order.",
  order_type: "Choose dine-in or takeaway.",
  category_id: "Choose a category.",
  main_category_id: "Choose a category.",
  sub_category_id: "Choose a category.",
  branch_id: "Choose a branch.",
  business_id: "Choose a business.",
  location_id: "Choose a stock place.",
  stock_location_id: "Choose a stock place.",
  from_location_id: "Choose where the stock comes from.",
  to_location_id: "Choose where the stock goes.",
  inventory_item_id: "Choose a stock item.",
  unit_price: "Enter a price.",
  total_amount: "Enter an amount.",
  amount_paid: "Enter an amount.",
  full_name: "Enter a name.",
  phone_number: "Enter a phone number.",
  pin_code: "PIN must be 4 numbers.",
  cancel_password: "Enter the manager PIN for cancelling.",
  credit_limit: "Enter a credit limit.",
};

const NETWORK_PATTERNS = [
  "failed to fetch",
  "network error",
  "networkerror",
  "network request failed",
  "load failed",
  "timeout",
  "timed out",
  "econnrefused",
  "econnaborted",
  "econnreset",
  "enotfound",
  "err_network",
  "err_internet_disconnected",
  "offline",
];

type Loose = {
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
  name?: unknown;
  response?: { status?: unknown; data?: unknown };
};

function asText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(". ");
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const v = value as { message?: unknown; error?: unknown };
    return asText(v.message ?? v.error);
  }
  return String(value);
}

function firstSentence(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

// True when the text is already a short, plain English sentence: no field
// names, codes, ids, stack traces or technical words.
function isPlain(text: string): boolean {
  if (!text || text.length > 160) return false;
  if (/_/.test(text)) return false;
  if (/[{}[\]<>=`\\]/.test(text)) return false;
  if (/\b[A-Z]{2,}[A-Z0-9]*\b/.test(text.replace(/\b(PIN|ETB|POS|OK|CBE|VAT|TIN|ID)\b/g, ""))) return false;
  if (/\b\d{3}\b/.test(text) && /status|code|error|request/i.test(text)) return false;
  if (/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(text)) return false;
  if (/\b(invalid|payload|entity|context|record|undefined|null|exception|request failed|uuid|sql|constraint|token|ID)\b/i.test(text)) return false;
  return true;
}

export function friendlyError(err: unknown, fallback: string = ERROR_TEXT.generic): string {
  if (err == null) return fallback;
  const e: Loose = typeof err === "object" ? (err as Loose) : { message: err };
  const data = (e.response?.data ?? null) as Record<string, unknown> | null;

  const statusRaw = e.response?.status ?? e.status ?? e.statusCode ?? data?.statusCode;
  const status = typeof statusRaw === "number" ? statusRaw : Number(statusRaw) || undefined;
  const text = asText(data?.message ?? data?.error ?? e.message ?? (typeof err === "string" ? err : ""));
  const code = asText(e.code ?? data?.code ?? data?.error);
  const lower = `${text} ${code}`.toLowerCase();

  // Not enough stock is the most useful thing to say, whatever the status.
  if (/insufficient_inventory|insufficient (stock|inventory)|not enough stock|out of stock/.test(lower)) {
    return ERROR_TEXT.noStock;
  }

  // No answer from the server at all, or it took too long.
  const noResponse = e.response == null && status == null;
  if (
    status === 0 ||
    status === 408 ||
    status === 504 ||
    NETWORK_PATTERNS.some((p) => lower.includes(p)) ||
    (noResponse && e.name === "TypeError" && lower.includes("fetch"))
  ) {
    return ERROR_TEXT.network;
  }

  // A wrong password / PIN at sign-in comes back as 401 too; say so plainly.
  if (/credential|wrong username|wrong password|incorrect password|invalid password|invalid pin|wrong pin|incorrect pin|invalid username/.test(lower)) {
    return ERROR_TEXT.wrongLogin;
  }
  if (/deactivated|turned off/.test(lower)) return ERROR_TEXT.accountOff;

  // A status code from the server is more reliable than guessing from its text.
  if (status && status >= 500) return ERROR_TEXT.server;
  if (status === 401 || status === 403) return ERROR_TEXT.permission;
  if (status === 404) return ERROR_TEXT.notFound;
  if (/access denied|forbidden|unauthori[sz]ed|not allowed|permission/.test(lower)) {
    return ERROR_TEXT.permission;
  }
  if (/not found|does not exist/.test(lower)) return ERROR_TEXT.notFound;

  // Validation text that names a backend field ("table_number should not be
  // empty") → a plain instruction for that field.
  const fields = text.match(/\b[a-z]+(?:_[a-z]+)+\b/g);
  if (fields) {
    for (const f of fields) {
      if (FIELD_HINTS[f]) return FIELD_HINTS[f];
    }
    return ERROR_TEXT.checkForm;
  }

  if (isPlain(text)) return firstSentence(text);

  if (status === 400 || status === 409 || status === 422) {
    return fallback === ERROR_TEXT.generic ? ERROR_TEXT.checkForm : fallback;
  }
  return fallback;
}
