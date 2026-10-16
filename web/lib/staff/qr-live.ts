"use client";

// Staff side of QR ordering (web cashier + waiter portals): the branch's live
// order socket for "new QR order" and guest assist requests, with a polling
// fallback, plus the small REST calls those screens need.
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { API_BASE } from "@/lib/api";

export type AssistType = "call_waiter" | "request_bill";

export interface AssistRequest {
  id: string;
  type: AssistType;
  table_number: number;
  table_label: string | null;
  /** The table's assigned waiter (null when nobody is assigned). */
  waiter_id: string | null;
  waiter_name: string | null;
  order_numbers: number[];
  created_at: string;
}

export interface StaffAuth {
  deviceToken: string | null;
  /** Waiter portal JWT; the cashier portal has none (device token only). */
  bearer?: string | null;
}

/** A new order as pushed on the socket — only the fields the alert needs. */
export interface PushedOrder {
  id: string;
  source?: string | null;
  order_number?: number | null;
  table_number?: number | null;
  /** The table's assigned waiter, when there is one. */
  waiter_id?: string | null;
  employee_name?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface OpenQrOrder {
  id: string;
  source?: string;
  order_number?: number | null;
  table_number?: number | null;
  total_amount?: number | null;
  created_at?: string | null;
  status?: string;
  waiter_id?: string | null;
  employee_name?: string | null;
  meta?: Record<string, unknown> | null;
  items?: Array<{ quantity?: number; menu_item_name?: string; name?: string; note?: string | null }>;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1"]);

/** Same LAN rule as the guest app: a phone can't reach "localhost". */
function apiBase(): string {
  try {
    const u = new URL(API_BASE);
    if (typeof window !== "undefined" && LOOPBACK.has(u.hostname) && !LOOPBACK.has(window.location.hostname)) {
      u.hostname = window.location.hostname;
      return u.toString().replace(/\/+$/, "");
    }
  } catch {
    // fall through
  }
  return API_BASE.replace(/\/+$/, "");
}

function headers(auth: StaffAuth): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-App-Client": "tauri-pos-app",
    ...(auth.deviceToken ? { "x-device-token": auth.deviceToken } : {}),
    ...(auth.bearer ? { Authorization: `Bearer ${auth.bearer}` } : {}),
  };
}

export const qrStaffApi = {
  async assistRequests(auth: StaffAuth): Promise<AssistRequest[]> {
    const res = await fetch(`${apiBase()}/orders/assist-requests`, { headers: headers(auth) });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { data?: { requests?: AssistRequest[] } };
    return body.data?.requests ?? [];
  },
  async dismissAssist(auth: StaffAuth, id: string): Promise<void> {
    await fetch(`${apiBase()}/orders/assist-requests/${encodeURIComponent(id)}/dismiss`, {
      method: "POST",
      headers: headers(auth),
    });
  },
  /** The branch's open (unpaid, not cancelled) QR orders, newest first. */
  async openQrOrders(auth: StaffAuth): Promise<OpenQrOrder[]> {
    const res = await fetch(`${apiBase()}/orders/cashier-queue`, { headers: headers(auth) });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { data?: { orders?: OpenQrOrder[] } | OpenQrOrder[] };
    const list = Array.isArray(body.data) ? body.data : (body.data?.orders ?? []);
    return list.filter((o) => o.source === "qr");
  },
  async accept(auth: StaffAuth, orderId: string): Promise<void> {
    const res = await fetch(`${apiBase()}/orders/${encodeURIComponent(orderId)}/accept`, {
      method: "POST",
      headers: headers(auth),
    });
    if (!res.ok) throw new Error(String(res.status));
  },
};

/** A short, friendly two-note chime (no audio file to load). */
export function playChime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.16);
      osc.stop(now + i * 0.16 + 0.32);
    });
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    // Audio blocked (no user gesture yet) — the toast still shows.
  }
}

const POLL_MS = 15_000;

/**
 * Live QR feed for staff screens: calls `onQrOrder` for each new QR order and
 * keeps the list of open guest requests current (socket first, poll fallback).
 */
export function useQrStaffFeed(
  auth: StaffAuth,
  onQrOrder: (order: PushedOrder) => void,
  /** Chime only for requests this screen cares about (e.g. a waiter's own tables). */
  shouldAlert?: (request: AssistRequest) => boolean,
) {
  const [requests, setRequests] = useState<AssistRequest[]>([]);
  const onQrOrderRef = useRef(onQrOrder);
  const shouldAlertRef = useRef(shouldAlert);
  useEffect(() => {
    onQrOrderRef.current = onQrOrder;
    shouldAlertRef.current = shouldAlert;
  }, [onQrOrder, shouldAlert]);
  const connected = useRef(false);
  const { deviceToken, bearer } = auth;

  const refresh = useCallback(async () => {
    if (!deviceToken) return;
    try {
      setRequests(await qrStaffApi.assistRequests({ deviceToken, bearer }));
    } catch {
      // keep what we have
    }
  }, [deviceToken, bearer]);

  useEffect(() => {
    if (!deviceToken) return;
    let socket: Socket | null = null;
    try {
      socket = io(`${new URL(apiBase()).origin}/orders`, {
        auth: { deviceToken },
        transports: ["websocket", "polling"],
      });
      socket.on("connect", () => {
        connected.current = true;
        void refresh();
      });
      socket.on("disconnect", () => {
        connected.current = false;
      });
      socket.on("new_order", (payload: { order?: PushedOrder }) => {
        if (payload?.order?.source === "qr") onQrOrderRef.current(payload.order);
      });
      socket.on("assist_request", (payload: { request?: AssistRequest }) => {
        const r = payload?.request;
        if (!r) return;
        setRequests((prev) => [...prev.filter((x) => !(x.table_number === r.table_number && x.type === r.type)), r]);
        if (!shouldAlertRef.current || shouldAlertRef.current(r)) playChime();
      });
      socket.on("assist_dismissed", (payload: { id?: string }) => {
        setRequests((prev) => prev.filter((x) => x.id !== payload?.id));
      });
    } catch {
      connected.current = false;
    }
    const kick = window.setTimeout(() => void refresh(), 0);
    const poll = window.setInterval(() => {
      if (!connected.current) void refresh();
    }, POLL_MS);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(poll);
      socket?.close();
      connected.current = false;
    };
  }, [deviceToken, refresh]);

  const dismiss = useCallback(
    async (id: string) => {
      setRequests((prev) => prev.filter((x) => x.id !== id));
      await qrStaffApi.dismissAssist({ deviceToken, bearer }, id);
    },
    [deviceToken, bearer],
  );

  return { requests, dismiss, refresh };
}

/** QR-order facts staff screens show, read from an order row. */
export function qrOrderInfo(order: { source?: unknown; meta?: unknown; table_number?: unknown; employee_name?: unknown }) {
  const isQr = order.source === "qr";
  const meta = (order.meta ?? {}) as { printed_at?: unknown; awaiting_accept?: unknown; qr_table_label?: unknown };
  return {
    isQr,
    // QR orders are attributed to the table's assigned waiter (employee_name).
    waiterName: typeof order.employee_name === "string" && order.employee_name ? order.employee_name : null,
    notPrinted: isQr && !meta.printed_at,
    awaitingAccept: isQr && meta.awaiting_accept === true,
    tableLabel: typeof meta.qr_table_label === "string" ? meta.qr_table_label : null,
  };
}
