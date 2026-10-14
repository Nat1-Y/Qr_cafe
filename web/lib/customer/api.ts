// Client for the guest QR API. Public: no staff auth, no cookies — the table
// token in the URL plus a session token header are the only credentials.
import type {
  CheckoutStart,
  GuestOrder,
  Landing,
  Menu,
  MenuChange,
  OrderLineInput,
  PaymentOption,
  PlaceOrderResult,
} from "./types";

const CONFIGURED_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
const LOOPBACK = new Set(["localhost", "127.0.0.1"]);

/**
 * API base URL. When the build points at localhost but the page was opened
 * from another device on the LAN (a phone scanning a test QR at
 * http://192.168.x.x:3000), "localhost" would mean the phone itself — swap in
 * the host the page came from. Production URLs are never loopback, so this is
 * a no-op there.
 */
export function apiBase(): string {
  if (typeof window === "undefined") return CONFIGURED_BASE;
  try {
    const u = new URL(CONFIGURED_BASE);
    if (LOOPBACK.has(u.hostname) && !LOOPBACK.has(window.location.hostname)) {
      u.hostname = window.location.hostname;
      return u.toString().replace(/\/+$/, "");
    }
  } catch {
    // fall through
  }
  return CONFIGURED_BASE.replace(/\/+$/, "");
}

/** Origin of the API (for sockets and server-relative image URLs). */
export function apiOrigin(): string {
  return new URL(apiBase()).origin;
}

/** Item images can be absolute, or server-relative (/api/public/...). */
export function resolveImageUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/api/")) return `${apiOrigin()}${url}`;
  return url;
}

export class GuestApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly changes: MenuChange[] | null,
    readonly retryAfter: number | null,
  ) {
    super(message);
  }

  /** No response at all — offline, DNS, server down. */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

interface Envelope<T> {
  status: string;
  data: T;
}

async function call<T>(
  path: string,
  init: RequestInit & { session?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body) headers["Content-Type"] = "application/json";
  if (init.session) headers["X-Customer-Session"] = init.session;
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
      credentials: "omit",
      cache: "no-store",
    });
  } catch {
    throw new GuestApiError("network", 0, null, null, null);
  }
  if (!res.ok) {
    let body: { message?: unknown; code?: unknown; changes?: unknown; retry_after?: unknown } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // non-JSON error
    }
    const message = Array.isArray(body.message) ? String(body.message[0]) : String(body.message ?? "");
    throw new GuestApiError(
      message,
      res.status,
      typeof body.code === "string" ? body.code : null,
      Array.isArray(body.changes) ? (body.changes as MenuChange[]) : null,
      typeof body.retry_after === "number" ? body.retry_after : Number(res.headers.get("Retry-After")) || null,
    );
  }
  return ((await res.json()) as Envelope<T>).data;
}

const t = (token: string) => `/public/t/${encodeURIComponent(token)}`;

let menuCache: { token: string; etag: string; menu: Menu } | null = null;

export const guestApi = {
  landing(token: string, session: string | null) {
    return call<Landing>(t(token), { session });
  },

  /** Revalidates with the ETag, so a reload costs a 304 when nothing changed. */
  async menu(token: string): Promise<Menu> {
    const headers: Record<string, string> = {};
    if (menuCache?.token === token) headers["If-None-Match"] = menuCache.etag;
    let res: Response;
    try {
      res = await fetch(`${apiBase()}${t(token)}/menu`, { headers, credentials: "omit", cache: "no-store" });
    } catch {
      if (menuCache?.token === token) return menuCache.menu;
      throw new GuestApiError("network", 0, null, null, null);
    }
    if (res.status === 304 && menuCache?.token === token) return menuCache.menu;
    if (!res.ok) throw new GuestApiError("", res.status, null, null, null);
    const menu = ((await res.json()) as Envelope<Menu>).data;
    const etag = res.headers.get("ETag");
    if (etag) menuCache = { token, etag, menu };
    return menu;
  },

  placeOrder(
    token: string,
    session: string,
    body: {
      client_order_id: string;
      items: OrderLineInput[];
      order_note?: string;
      customer_name?: string;
      customer_phone?: string;
    },
  ) {
    return call<PlaceOrderResult>(`${t(token)}/orders`, { method: "POST", session, body: JSON.stringify(body) });
  },

  addItems(token: string, session: string, orderId: string, body: { addition_id: string; items: OrderLineInput[] }) {
    return call<{ order: GuestOrder }>(`${t(token)}/orders/${orderId}/items`, {
      method: "POST",
      session,
      body: JSON.stringify(body),
    });
  },

  async orders(token: string, session: string): Promise<GuestOrder[]> {
    return (await call<{ orders: GuestOrder[] }>(`${t(token)}/orders`, { session })).orders;
  },

  assist(token: string, session: string, type: "call_waiter" | "request_bill") {
    return call<{ received: boolean }>(`${t(token)}/assist`, {
      method: "POST",
      session,
      body: JSON.stringify({ type }),
    });
  },

  paymentOptions(token: string) {
    return call<{ options: PaymentOption[] }>(`${t(token)}/payment-options`);
  },

  startPayment(token: string, session: string, orderId: string, provider: string) {
    return call<CheckoutStart>(`${t(token)}/orders/${orderId}/pay`, {
      method: "POST",
      session,
      body: JSON.stringify({ provider, return_url: typeof window !== "undefined" ? window.location.href : "" }),
    });
  },
};
