"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useWaiterAuth } from "@/components/waiter/auth-context";
import { getDeviceEnrollment, isDeviceEnrolled } from "@/lib/waiter/device";
import { waiterServices } from "@/lib/waiter/api";
import { AuthSplitLayout } from "@/components/auth-split-layout";
import { PinDots, PinKeypad } from "@/components/pin-keypad";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/errors";

type Waiter = {
  id: string;
  username?: string;
  full_name?: string;
  name?: string;
};

type WaiterVisibleItem = {
  id: string;
  name: string;
  unit: string;
  base_unit: string;
  min_quantity: number;
  quantity: number;
};

function getInitials(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/// One inventory row: name, quantity + unit, and a Low/Out pill derived from
// the item's own min_quantity threshold.
function InventoryRow({ item }: { item: WaiterVisibleItem }) {
  const out = item.quantity <= 0;
  const low = !out && item.min_quantity > 0 && item.quantity <= item.min_quantity;
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="text-meta opacity-80">
          {item.quantity} {item.base_unit || item.unit || ""} left
        </p>
      </div>
      {out ? (
        <StatusBadge kind="stock" status="out" />
      ) : low ? (
        <StatusBadge kind="stock" status="low" />
      ) : null}
    </li>
  );
}

// Stock list shown on the brand panel (desktop) or below the form (mobile).
function InventoryList({
  items,
  onBrand = false,
}: {
  items: WaiterVisibleItem[];
  onBrand?: boolean;
}) {
  return (
    <div className={onBrand ? "text-sidebar-foreground" : "text-foreground"}>
      <p className={cn("text-eyebrow", onBrand ? "text-sidebar-muted" : "text-accent")}>Stock right now</p>
      <p className="mt-1 text-section">What&apos;s left to sell</p>
      <ul
        className={cn(
          "mt-3 max-h-[26rem] divide-y overflow-y-auto pr-1",
          onBrand ? "divide-sidebar-border" : "divide-border",
        )}>
        {items.map((item) => (
          <InventoryRow key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}

const PIN_LENGTH = 4;

export default function WaiterLoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, loading: authLoading } = useWaiterAuth();

  const [deviceLabel, setDeviceLabel] = useState<string>("");
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [loadingWaiters, setLoadingWaiters] = useState(true);

  const [selected, setSelected] = useState<Waiter | null>(null);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(false);

  // Owner-curated inventory items, shown inline on this screen when configured
  // (no login required — visible to anyone at this device).
  const [visibleItems, setVisibleItems] = useState<WaiterVisibleItem[]>([]);

  // Device must be enrolled before anyone can sign in.
  useEffect(() => {
    if (authLoading) return;
    if (!isDeviceEnrolled()) {
      router.replace("/waiter/enroll");
      return;
    }
    if (isAuthenticated) {
      router.replace("/waiter/create-order");
      return;
    }
    const enrollment = getDeviceEnrollment();
    setDeviceLabel(enrollment?.deviceName?.trim() || "");
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingWaiters(true);
      try {
        const res: any = await waiterServices.users.getWaiters();
        const list: Waiter[] =
          res?.data?.data?.users ?? res?.data?.users ?? [];
        if (active) {
          setWaiters(
            (Array.isArray(list) ? list : []).filter((u) =>
              String(u.full_name || u.name || u.username || "").trim(),
            ),
          );
        }
      } catch {
        if (active) setWaiters([]);
      } finally {
        if (active) setLoadingWaiters(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    waiterServices.inventory.getWaiterVisibleItems().then((items) => {
      if (active) setVisibleItems(items);
    });
    return () => {
      active = false;
    };
  }, []);

  const selectedName = useMemo(
    () =>
      selected
        ? selected.full_name || selected.name || selected.username || ""
        : "",
    [selected],
  );

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
  }, []);

  const submit = useCallback(
    async (enteredPin: string) => {
      if (!selected || submitting) return;
      setSubmitting(true);
      try {
        const user = await login(selectedName.trim(), enteredPin);
        toast.success(`Signed in as ${user.full_name || user.username}`);
        router.replace("/waiter/create-order");
      } catch (err: any) {
        toast.error(friendlyError(err, "Couldn't sign in. Please try again."));
        setPin("");
        triggerShake();
      } finally {
        setSubmitting(false);
      }
    },
    [selected, selectedName, submitting, login, router, triggerShake],
  );

  const pressDigit = useCallback(
    (digit: string) => {
      if (submitting) return;
      setPin((prev) => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + digit;
        if (next.length === PIN_LENGTH) {
          // Auto-submit once the PIN is complete (POS-style).
          setTimeout(() => submit(next), 120);
        }
        return next;
      });
    },
    [submitting, submit],
  );

  const goBack = useCallback(() => {
    setSelected(null);
    setPin("");
  }, []);

  // Keyboard support on the PIN screen.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") pressDigit(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Escape") goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, pressDigit, goBack]);

  return (
    <AuthSplitLayout
      headline="Take the order, send it to the kitchen."
      subline="Waiters sign in here with their name and PIN."
      panel={visibleItems.length > 0 ? <InventoryList items={visibleItems} onBrand /> : undefined}>
      <style>{`
        @keyframes wp-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .wp-shake { animation: wp-shake 0.4s ease-in-out; }
      `}</style>

      {!selected ? (
        <>
          <div className="mb-6">
            {deviceLabel ? <p className="eyebrow mb-1">{deviceLabel}</p> : null}
            <h1 className="text-title text-foreground">Who&apos;s on the floor?</h1>
            <p className="mt-1 text-sm text-muted-foreground">Tap your name, then enter your PIN.</p>
          </div>

          {loadingWaiters ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading staff…
            </div>
          ) : waiters.length === 0 ? (
            <p className="py-10 text-sm text-muted-foreground">
              No waiters here yet. Ask your manager to add you, then try again.
            </p>
          ) : (
            <div className="grid max-h-[22rem] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {waiters.map((w) => {
                const label = w.full_name || w.name || w.username || "Unknown";
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      setSelected(w);
                      setPin("");
                    }}
                    className="flex min-h-14 items-center gap-3 rounded-card border border-border bg-card px-3 py-2.5 text-left transition-colors outline-none hover:border-primary/40 hover:bg-row-hover focus-visible:ring-4 focus-visible:ring-ring">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-highlight text-sm font-semibold text-highlight-foreground">
                      {getInitials(label)}
                    </span>
                    <span className="line-clamp-2 text-sm font-medium text-foreground">{label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-8">
          <button
            type="button"
            onClick={goBack}
            disabled={submitting}
            className="-ml-3 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
            <ArrowLeft className="size-4" />
            Not you?
          </button>

          <div className="flex items-center gap-3">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-highlight text-lg font-semibold text-highlight-foreground">
              {getInitials(selectedName)}
            </span>
            <div className="min-w-0">
              <p className="eyebrow">Waiter</p>
              <p className="truncate text-section text-foreground">{selectedName}</p>
            </div>
          </div>

          <div className={shake ? "wp-shake" : ""}>
            <p className="mb-3 text-sm font-medium text-foreground">Enter your 4-digit PIN</p>
            <PinDots length={PIN_LENGTH} filled={pin.length} />
          </div>

          <PinKeypad
            onDigit={pressDigit}
            onClear={() => setPin("")}
            onBackspace={() => setPin((p) => p.slice(0, -1))}
            disabled={submitting}
          />

          {submitting ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Signing in…
            </p>
          ) : null}
        </div>
      )}

      {visibleItems.length > 0 ? (
        <div className="mt-10 rounded-card border border-border bg-card p-5 md:hidden">
          <InventoryList items={visibleItems} />
        </div>
      ) : null}
    </AuthSplitLayout>
  );
}
