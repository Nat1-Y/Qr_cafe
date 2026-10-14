"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { I18nProvider, useI18n, type MessageKey } from "@/lib/customer/i18n";
import { guestApi, GuestApiError } from "@/lib/customer/api";
import { readJSON, removeKey, storageKeys, writeJSON } from "@/lib/customer/storage";
import { useGuestOrders } from "@/lib/customer/use-guest-orders";
import type { GuestOrder, Landing, Menu, MenuChange, MenuItem, PaymentOption } from "@/lib/customer/types";
import {
  addToCart,
  cartCount,
  cartTotal,
  removeLine,
  setLineNote,
  setLineQuantity,
  type CartLine,
} from "@/lib/ordering/cart";
import { LiveRegion, MenuSkeleton, OfflineBanner, WelcomeSkeleton } from "./bits";
import { MenuScreen } from "./MenuScreen";
import { CartBar } from "./CartBar";
import { BrokenQr, LoadError, Welcome } from "./Welcome";
import { OrdersView, stageLabelKey } from "./OrdersView";
import type { GuestDetails } from "./CartSheet";

// Sheets and dialogs load on first use, keeping the menu's first paint small.
const ItemSheet = dynamic(() => import("./ItemSheet"), { ssr: false });
const CartSheet = dynamic(() => import("./CartSheet"), { ssr: false });
const ChangesDialog = dynamic(() => import("./ChangesDialog"), { ssr: false });

type View = "welcome" | "menu" | "orders";
type Phase = "loading" | "ready" | "broken" | "error";

interface Pending {
  id: string;
  signature: string;
}

const EMPTY_DETAILS: GuestDetails = { orderNote: "", name: "", phone: "" };

function newId(): string {
  const c: Crypto = globalThis.crypto;
  // randomUUID only exists in secure contexts (https/localhost); a phone on
  // http://192.168.x.x during testing gets the RFC 4122 v4 fallback.
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Android/iOS back closes the open sheet instead of leaving the page: opening
 * pushes a history entry, back pops it and closes.
 */
function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    if (!open) return;
    const marker = { sheet: Date.now() };
    window.history.pushState(marker, "");
    const onPop = () => closeRef.current();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state && (window.history.state as { sheet?: number }).sheet === marker.sheet) {
        window.history.back();
      }
    };
  }, [open]);
}

function GuestApp({ token }: { token: string }) {
  const { t, lang } = useI18n();
  const { setTheme } = useTheme();

  const [phase, setPhase] = useState<Phase>("loading");
  const [landing, setLanding] = useState<Landing | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuFailed, setMenuFailed] = useState(false);
  const [viewChoice, setViewChoice] = useState<View | null>(null);
  const [lines, setLines] = useState<CartLine[]>(() => readJSON<CartLine[]>(storageKeys.cart(token), []));
  const [details, setDetails] = useState<GuestDetails>(EMPTY_DETAILS);
  const [addTarget, setAddTarget] = useState<GuestOrder | null>(null);
  const [itemSheet, setItemSheet] = useState<{ item: MenuItem; drink: boolean } | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [changes, setChanges] = useState<MenuChange[] | null>(null);
  const [sending, setSending] = useState(false);
  const sendLock = useRef(false);
  // The "Try again" toast action re-runs the latest send().
  const retrySend = useRef<() => void>(() => {});
  const [justPlacedId, setJustPlacedId] = useState<string | null>(null);
  const [payInstructions, setPayInstructions] = useState<string | null>(null);
  const [payOptions, setPayOptions] = useState<PaymentOption[]>([]);
  const [assistSent, setAssistSent] = useState<"call_waiter" | "request_bill" | null>(null);
  const [assistBusy, setAssistBusy] = useState(false);
  const [announce, setAnnounce] = useState("");

  const session = landing?.session.token ?? null;
  const { orders, loaded: ordersLoaded, sessionEnded, lastChange, upsert } = useGuestOrders(token, session);

  // Guests follow their phone's light/dark setting unless they've picked one.
  useEffect(() => {
    try {
      if (!window.localStorage.getItem("theme")) setTheme("system");
    } catch {
      // storage blocked — stay on the default
    }
  }, [setTheme]);

  const loadMenu = useCallback(async () => {
    try {
      const m = await guestApi.menu(token);
      setMenu(m);
      setMenuFailed(false);
    } catch {
      setMenuFailed(true);
    }
  }, [token]);

  const load = useCallback(async () => {
    try {
      const saved = readJSON<string | null>(storageKeys.session(token), null);
      const l = await guestApi.landing(token, saved);
      writeJSON(storageKeys.session(token), l.session.token);
      setLanding(l);
      setPhase("ready");
      void loadMenu();
    } catch (err) {
      setPhase(err instanceof GuestApiError && err.status === 404 ? "broken" : "error");
    }
  }, [token, loadMenu]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  useEffect(() => {
    writeJSON(storageKeys.cart(token), lines);
  }, [token, lines]);

  // Status changes are announced for screen readers ("Order #12: In the kitchen").
  const liveMessage = useMemo(() => {
    if (!lastChange) return announce;
    const stage = t(stageLabelKey(lastChange.stage));
    return t("liveStatus", {
      n: lastChange.orderNumber ?? "",
      stage: lastChange.paid && lastChange.stage === "served" ? `${stage} · ${t("paid")}` : stage,
    });
  }, [lastChange, announce, t]);

  const canOrder = Boolean(landing?.ordering.open);
  const view: View = viewChoice ?? (orders.length > 0 ? "orders" : "welcome");
  const count = cartCount(lines);
  const total = cartTotal(lines);
  const cartQtyById = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(l.menu_item_id, (m.get(l.menu_item_id) ?? 0) + l.quantity);
    return m;
  }, [lines]);

  useBackToClose(itemSheet != null, () => setItemSheet(null));
  useBackToClose(cartOpen, () => setCartOpen(false));

  const go = useCallback((next: View) => {
    setViewChoice(next);
    window.scrollTo({ top: 0 });
  }, []);

  const addItem = useCallback(
    (item: MenuItem, quantity: number, note: string) => {
      setLines((prev) =>
        addToCart(
          prev,
          {
            menu_item_id: item.id,
            name: item.name,
            unit_price: item.price ?? 0,
            main_category: "",
          },
          quantity,
          note,
        ),
      );
      const msg = t("addedToast", { name: item.name });
      setAnnounce(msg);
      toast.success(msg, { id: "guest-added", duration: 1200 });
    },
    [t],
  );

  const removeWithUndo = useCallback(
    (line: CartLine) => {
      let index = -1;
      setLines((prev) => {
        index = prev.findIndex((l) => l.key === line.key);
        return removeLine(prev, line.key);
      });
      const msg = t("removedToast", { name: line.name });
      setAnnounce(msg);
      toast(msg, {
        id: `removed-${line.key}`,
        duration: 5000,
        action: {
          label: t("undo"),
          onClick: () =>
            setLines((prev) => {
              if (prev.some((l) => l.key === line.key)) return prev;
              const next = prev.slice();
              next.splice(Math.max(0, Math.min(index, next.length)), 0, line);
              return next;
            }),
        },
      });
    },
    [t],
  );

  const errorText = useCallback(
    (err: unknown): string => {
      if (!(err instanceof GuestApiError)) return t("errGeneric");
      if (err.isNetwork) return t("errNetwork");
      const byStatus: Partial<Record<number, MessageKey>> = {
        401: "errSession",
        403: "errClosed",
        429: "errSlowDown",
      };
      const key = byStatus[err.status];
      if (key) return t(key);
      // Server copy is plain English; in Amharic use our own words.
      if (err.status === 400) return lang === "en" && err.message ? err.message : t("errInput");
      return lang === "en" && err.message ? err.message : t("errGeneric");
    },
    [t, lang],
  );

  /** Apply a "menu changed" diff to the cart: drop what's gone, re-price the rest. */
  const applyChanges = useCallback((list: MenuChange[]) => {
    setLines((prev) =>
      prev.flatMap((l) => {
        const c = list.find((x) => x.menu_item_id === l.menu_item_id);
        if (!c) return [l];
        if (c.reason === "price_changed" && c.price != null) return [{ ...l, unit_price: c.price }];
        return [];
      }),
    );
  }, []);

  const send = useCallback(async () => {
    if (!landing || !session || lines.length === 0 || sendLock.current) return;
    sendLock.current = true;
    setSending(true);

    // Same cart + same details → same idempotency key, even across a reload,
    // so a retry after a dropped response can never create a second order.
    const items = lines.map((l) => ({
      menu_item_id: l.menu_item_id,
      quantity: l.quantity,
      ...(l.note ? { note: l.note } : {}),
      ...(landing.options.show_prices ? { seen_price: l.unit_price } : {}),
    }));
    const signature = JSON.stringify({ items, details, target: addTarget?.id ?? null });
    const prior = readJSON<Pending | null>(storageKeys.pending(token), null);
    const pending: Pending = prior && prior.signature === signature ? prior : { id: newId(), signature };
    writeJSON(storageKeys.pending(token), pending);

    try {
      if (addTarget) {
        const { order } = await guestApi.addItems(token, session, addTarget.id, { addition_id: pending.id, items });
        upsert(order);
        setJustPlacedId(null);
      } else {
        const result = await guestApi.placeOrder(token, session, {
          client_order_id: pending.id,
          items,
          ...(details.orderNote.trim() ? { order_note: details.orderNote.trim() } : {}),
          ...(details.name.trim() ? { customer_name: details.name.trim() } : {}),
          ...(details.phone.trim() ? { customer_phone: details.phone.trim() } : {}),
        });
        upsert(result.order);
        setJustPlacedId(result.order.id);
        // Counter instructions are ours to word (and translate); others come from the provider.
        const auto = result.payment.auto;
        setPayInstructions(auto && auto.provider !== "counter" ? auto.instructions : null);
        if (auto?.checkout_url) window.location.href = auto.checkout_url;
        setPayOptions(result.payment.options);
        setAnnounce(`${t("sentTitle")} ${t("orderNumber", { n: result.order.order_number ?? "" })}`);
      }
      removeKey(storageKeys.pending(token));
      setLines([]);
      setDetails(EMPTY_DETAILS);
      setAddTarget(null);
      setCartOpen(false);
      go("orders");
    } catch (err) {
      if (err instanceof GuestApiError && err.code === "menu_changed" && err.changes) {
        applyChanges(err.changes);
        setChanges(err.changes);
        setCartOpen(false);
        void loadMenu();
      } else if (err instanceof GuestApiError && err.status === 409 && addTarget) {
        toast.error(t("errOrderClosed"));
        setAddTarget(null);
      } else {
        const retry = err instanceof GuestApiError && (err.isNetwork || err.status >= 500);
        toast.error(errorText(err), retry ? { action: { label: t("tryAgain"), onClick: () => retrySend.current() } } : undefined);
        if (err instanceof GuestApiError && (err.status === 401 || err.status === 403)) void load();
      }
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }, [landing, session, lines, details, addTarget, token, upsert, t, go, applyChanges, loadMenu, errorText, load]);

  useEffect(() => {
    retrySend.current = () => void send();
  }, [send]);

  const assist = useCallback(
    async (type: "call_waiter" | "request_bill") => {
      if (!session) return;
      setAssistBusy(true);
      try {
        await guestApi.assist(token, session, type);
        setAssistSent(type);
      } catch (err) {
        // Over the limit means we already told them — say so, don't scold.
        if (err instanceof GuestApiError && err.status === 429) setAssistSent(type);
        else toast.error(errorText(err));
      } finally {
        setAssistBusy(false);
        window.setTimeout(() => setAssistSent(null), 60_000);
      }
    },
    [session, token, errorText],
  );

  const pay = useCallback(
    async (order: GuestOrder, provider: string) => {
      if (!session) return;
      try {
        const r = await guestApi.startPayment(token, session, order.id, provider);
        if (r.checkout_url) window.location.href = r.checkout_url;
        else if (r.instructions) toast(r.instructions);
      } catch (err) {
        toast.error(errorText(err));
      }
    },
    [session, token, errorText],
  );

  if (phase === "broken") return <BrokenQr />;
  if (phase === "error") return <LoadError message={t("errNetwork")} onRetry={() => void load()} />;
  if (phase === "loading" || !landing) return <WelcomeSkeleton />;
  if (sessionEnded) return <LoadError message={t("errSession")} onRetry={() => window.location.reload()} />;
  if (!ordersLoaded && viewChoice == null) return <WelcomeSkeleton />;

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-background">
      <OfflineBanner />
      <LiveRegion message={liveMessage} />

      {view === "welcome" ? <Welcome landing={landing} onStart={() => go("menu")} /> : null}

      {view === "menu" ? (
        menu ? (
          <MenuScreen
            landing={landing}
            menu={menu}
            canOrder={canOrder}
            cartQtyById={cartQtyById}
            ordersCount={orders.length}
            onOpenItem={(item, drink) => setItemSheet({ item, drink })}
            onQuickAdd={(item) => addItem(item, 1, "")}
            onOrders={() => go("orders")}
            bottomSpace={count > 0}
          />
        ) : menuFailed ? (
          <LoadError message={t("menuLoadError")} onRetry={() => void loadMenu()} />
        ) : (
          <MenuSkeleton />
        )
      ) : null}

      {view === "orders" ? (
        <OrdersView
          landing={landing}
          orders={orders}
          justPlacedId={justPlacedId}
          payInstructions={payInstructions}
          payOptions={payOptions}
          onPay={(o, p) => void pay(o, p)}
          onAddMore={(o) => {
            setAddTarget(o);
            setJustPlacedId(null);
            go("menu");
          }}
          onNewOrder={() => {
            setAddTarget(null);
            setJustPlacedId(null);
            go("menu");
          }}
          onAssist={(type) => void assist(type)}
          assistSent={assistSent}
          assistBusy={assistBusy}
        />
      ) : null}

      {view === "menu" && canOrder ? (
        <CartBar
          count={count}
          total={total}
          showPrice={landing.options.show_prices}
          label={
            addTarget
              ? `${t("addingTo", { n: addTarget.order_number ?? "" })} · ${count === 1 ? t("itemCountOne") : t("itemCount", { n: count })}`
              : undefined
          }
          onOpen={() => setCartOpen(true)}
        />
      ) : null}

      {itemSheet ? (
        <ItemSheet
          key={itemSheet.item.id}
          item={itemSheet.item}
          drink={itemSheet.drink}
          open
          onOpenChange={(o) => !o && setItemSheet(null)}
          allowNotes={landing.options.allow_notes}
          canOrder={canOrder}
          onAdd={(qty, note) => {
            addItem(itemSheet.item, qty, note);
            setItemSheet(null);
          }}
        />
      ) : null}

      {cartOpen ? (
        <CartSheet
          open
          onOpenChange={setCartOpen}
          lines={lines}
          total={total}
          addingToOrderNumber={addTarget ? (addTarget.order_number ?? 0) : null}
          allowNotes={landing.options.allow_notes}
          showPrices={landing.options.show_prices}
          details={details}
          onDetails={setDetails}
          onQty={(key, qty) => {
            const line = lines.find((l) => l.key === key);
            if (line && qty <= 0) removeWithUndo(line);
            else setLines((p) => setLineQuantity(p, key, qty));
          }}
          onRemove={removeWithUndo}
          onNote={(key, note) => setLines((p) => setLineNote(p, key, note))}
          onSend={() => void send()}
          sending={sending}
        />
      ) : null}

      {changes ? (
        <ChangesDialog
          changes={changes}
          onDone={() => {
            setChanges(null);
            if (lines.length > 0) setCartOpen(true);
          }}
        />
      ) : null}

    </div>
  );
}

export function CustomerApp({ token }: { token: string }) {
  return (
    <I18nProvider>
      <GuestApp token={token} />
    </I18nProvider>
  );
}
