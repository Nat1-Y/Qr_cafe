"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { useCashierAuth } from "@/components/cashier/auth-context";
import { getDeviceEnrollment, isDeviceEnrolled } from "@/lib/cashier/device";
import { cashierServices } from "@/lib/cashier/api";
import { AuthSplitLayout } from "@/components/auth-split-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/errors";

type Cashier = {
  id: string;
  username?: string;
  full_name?: string;
  name?: string;
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

export default function CashierLoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, loading: authLoading } = useCashierAuth();

  const [deviceLabel, setDeviceLabel] = useState<string>("");
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loadingCashiers, setLoadingCashiers] = useState(true);

  const [selected, setSelected] = useState<Cashier | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isDeviceEnrolled()) {
      router.replace("/cashier/enroll");
      return;
    }
    if (isAuthenticated) {
      router.replace("/cashier");
      return;
    }
    const enrollment = getDeviceEnrollment();
    setDeviceLabel(enrollment?.deviceName?.trim() || "");
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingCashiers(true);
      try {
        const res: any = await cashierServices.users.getCashiers();
        const list: Cashier[] =
          res?.data?.data?.users ?? res?.data?.users ?? [];
        if (active) {
          setCashiers(
            (Array.isArray(list) ? list : []).filter((u) =>
              String(u.full_name || u.name || u.username || "").trim(),
            ),
          );
        }
      } catch {
        if (active) setCashiers([]);
      } finally {
        if (active) setLoadingCashiers(false);
      }
    })();
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

  const submit = useCallback(async () => {
    if (!selected || submitting || !password) return;
    setSubmitting(true);
    try {
      const user = await login(selectedName.trim(), password);
      toast.success(`Signed in as ${user.full_name || user.username}`);
      router.replace("/cashier");
    } catch (err: any) {
      toast.error(friendlyError(err, "Couldn't sign in. Please try again."));
      setPassword("");
      triggerShake();
    } finally {
      setSubmitting(false);
    }
  }, [selected, selectedName, submitting, password, login, router, triggerShake]);

  const goBack = useCallback(() => {
    setSelected(null);
    setPassword("");
    setShowPassword(false);
  }, []);

  return (
    <AuthSplitLayout
      headline="Take the payment, print the receipt, next."
      subline="Cashiers sign in here to take payment for orders.">
      <style>{`
        @keyframes cp-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .cp-shake { animation: cp-shake 0.4s ease-in-out; }
      `}</style>

      {!selected ? (
        <>
          <div className="mb-6">
            {deviceLabel ? <p className="eyebrow mb-1">{deviceLabel}</p> : null}
            <h1 className="text-title text-foreground">Who&apos;s on the till?</h1>
            <p className="mt-1 text-sm text-muted-foreground">Tap your name to sign in.</p>
          </div>

          {loadingCashiers ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading staff…
            </div>
          ) : cashiers.length === 0 ? (
            <p className="py-10 text-sm text-muted-foreground">
              No cashiers here yet. Ask your manager to add you, then try again.
            </p>
          ) : (
            <div className="grid max-h-[22rem] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {cashiers.map((c) => {
                const label = c.full_name || c.name || c.username || "Unknown";
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelected(c);
                      setPassword("");
                    }}
                    className="flex min-h-14 items-center gap-3 rounded-card border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-row-hover focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none">
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
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}>
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
              <p className="eyebrow">Cashier</p>
              <p className="truncate text-section text-foreground">{selectedName}</p>
            </div>
          </div>

          <div className={shake ? "cp-shake space-y-2" : "space-y-2"}>
            <Label htmlFor="cashier-password">Password</Label>
            <div className="relative">
              <Input
                id="cashier-password"
                type={showPassword ? "text" : "password"}
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="h-11 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" size="charge" className="w-full" disabled={submitting || !password}>
            {submitting ? (
              <>
                <Loader2 className="animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      )}
    </AuthSplitLayout>
  );
}
