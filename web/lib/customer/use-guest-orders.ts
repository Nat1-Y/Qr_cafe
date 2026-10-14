"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { apiOrigin, guestApi, GuestApiError } from "./api";
import type { GuestOrder, GuestStage } from "./types";

const POLL_MS = 15_000;

export interface StageChange {
  orderNumber: number | null;
  stage: GuestStage;
  paid: boolean;
  at: number;
}

/**
 * This guest's orders, kept live: the /customer socket pushes changes to the
 * session's own room; while the socket is down we poll every 15s instead, and
 * we always refresh when the tab comes back into view. `lastChange` reports
 * the latest status change of an existing order (for screen-reader
 * announcements).
 */
export function useGuestOrders(token: string, session: string | null) {
  const [orders, setOrders] = useState<GuestOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [lastChange, setLastChange] = useState<StageChange | null>(null);
  const connectedRef = useRef(false);
  const knownRef = useRef(new Map<string, { stage: GuestStage; paid: boolean }>());

  // Compare against what we last saw; report a status change, remember the new state.
  const noteChanges = useCallback((list: GuestOrder[]) => {
    for (const o of list) {
      const prev = knownRef.current.get(o.id);
      if (prev && (prev.stage !== o.stage || prev.paid !== o.paid)) {
        setLastChange({ orderNumber: o.order_number, stage: o.stage, paid: o.paid, at: Date.now() });
      }
      knownRef.current.set(o.id, { stage: o.stage, paid: o.paid });
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const list = await guestApi.orders(token, session);
      noteChanges(list);
      setOrders(list);
      setLoaded(true);
    } catch (err) {
      if (err instanceof GuestApiError && err.status === 401) setSessionEnded(true);
      setLoaded(true);
    }
  }, [token, session, noteChanges]);

  /** Merge one order (from a socket push or a write we just made). */
  const upsert = useCallback(
    (order: GuestOrder) => {
      noteChanges([order]);
      setOrders((prev) => {
        const i = prev.findIndex((o) => o.id === order.id);
        if (i === -1) return [order, ...prev];
        const next = prev.slice();
        next[i] = order;
        return next;
      });
    },
    [noteChanges],
  );

  useEffect(() => {
    if (!session) return;
    let socket: Socket | null = null;
    try {
      socket = io(`${apiOrigin()}/customer`, {
        auth: { qrToken: token, session },
        transports: ["websocket", "polling"],
        reconnectionDelayMax: 10_000,
      });
      socket.on("connect", () => {
        connectedRef.current = true;
        void refresh(); // catch anything missed while disconnected
      });
      socket.on("disconnect", () => {
        connectedRef.current = false;
      });
      socket.on("order_updated", (payload: { order?: GuestOrder }) => {
        if (payload?.order) upsert(payload.order);
      });
    } catch {
      connectedRef.current = false;
    }

    const kick = window.setTimeout(() => void refresh(), 0);
    const poll = window.setInterval(() => {
      if (!connectedRef.current && document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      window.clearTimeout(kick);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      socket?.close();
      connectedRef.current = false;
    };
  }, [token, session, refresh, upsert]);

  return { orders, loaded, sessionEnded, lastChange, refresh, upsert };
}
