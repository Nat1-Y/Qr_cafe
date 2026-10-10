"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  WifiOff,
  RefreshCw,

  Loader2,
  QrCode,
  X,
} from "lucide-react";
import { Scanner, type IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { enrollDevice, isDeviceEnrolled } from "@/lib/waiter/device";
import { AuthSplitLayout } from "@/components/auth-split-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Enrollment QR codes encode the branch's plain enrollment code. Tolerate a
 * JSON wrapper ({ "code": "..." }) too, in case the admin format evolves.
 */
function extractCode(raw: string): string {
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed.code === "string") return parsed.code.trim();
  } catch {
    /* not JSON — treat as a bare code */
  }
  return trimmed;
}

/**
 * First-run screen for the waiter portal. The operator pastes the reusable
 * enrollment code minted by an owner/platform admin for a specific branch;
 * redeeming it stores a long-lived device token in localStorage that pins all
 * subsequent traffic to that branch.
 */
export default function EnrollPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const [isOnline, setIsOnline] = useState(true);
  const [checkingConn, setCheckingConn] = useState(false);

  const checkConnection = useCallback(() => {
    setCheckingConn(true);
    setIsOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    setCheckingConn(false);
  }, []);

  useEffect(() => {
    // Already enrolled? Skip straight to login.
    if (isDeviceEnrolled()) {
      router.replace("/waiter/login");
      return;
    }
    checkConnection();
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [checkConnection, router]);

  const submitCode = useCallback(
    async (rawCode: string) => {
      if (submitting) return;
      const trimmed = rawCode.trim();
      if (!trimmed) {
        setError("Please enter the enrollment code.");
        return;
      }

      setSubmitting(true);
      setError(null);
      try {
        await enrollDevice(trimmed, deviceName);
        router.replace("/waiter/login");
      } catch (err: any) {
        const message =
          err?.message || "Enrollment failed. Check the code and try again.";
        setError(Array.isArray(message) ? message.join(", ") : message);
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, deviceName, router],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCode(code);
  };

  // A successful scan fills the code and immediately redeems it — the operator
  // just points the camera at the QR shown in the admin dashboard.
  const handleScan = useCallback(
    (results: IDetectedBarcode[]) => {
      const raw = results?.[0]?.rawValue;
      if (!raw) return;
      const scanned = extractCode(raw).toUpperCase();
      setScanning(false);
      setCode(scanned);
      submitCode(scanned);
    },
    [submitCode],
  );

  return (
    <AuthSplitLayout
      headline="Link this phone or tablet to its branch."
      subline="You only do this once per device. Ask your manager for the QR code or enrollment code.">
      {!isOnline && (
        <div className="mb-6 flex items-start gap-3 rounded-card bg-destructive-soft px-4 py-3 text-destructive">
          <WifiOff className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">No internet connection</p>
            <p className="mt-0.5 text-meta">Enrolling needs a connection. Connect and try again.</p>
          </div>
          <button
            onClick={checkConnection}
            disabled={checkingConn}
            className="flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-destructive/10 disabled:opacity-50"
            title="Retry connection"
            aria-label="Retry connection">
            <RefreshCw className={`size-4 ${checkingConn ? "animate-spin" : ""}`} />
          </button>
        </div>
      )}

      <div className="mb-8">
        <p className="eyebrow mb-1">First-time setup</p>
        <h1 className="text-title text-foreground">Set up this device</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Scan the QR code from your administrator, or type the enrollment code.
        </p>
      </div>

      {scanning ? (
        <div className="mb-5 space-y-3">
          <div className="overflow-hidden rounded-card border border-border bg-sidebar">
            <Scanner
              onScan={handleScan}
              onError={() =>
                setError(
                  "Couldn't access the camera. Allow camera access or enter the code manually.",
                )
              }
              formats={["qr_code"]}
              components={{ finder: true }}
              styles={{ container: { width: "100%" } }}
            />
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={() => setScanning(false)}>
            <X />
            Cancel scan
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="lg"
          className="mb-5 w-full"
          onClick={() => {
            setError(null);
            setScanning(true);
          }}
          disabled={submitting}>
          <QrCode />
          Scan QR code
        </Button>
      )}

      {!scanning && (
        <div className="mb-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-meta text-muted-foreground">or type the code</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="enrollment-code">Enrollment code</Label>
          <Input
            id="enrollment-code"
            type="text"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              if (error) setError(null);
            }}
            placeholder="A1B2C3D4E5F6"
            className="h-12 text-center text-lg"
            disabled={submitting}
            aria-invalid={!!error}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="device-name">
            Device name <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="device-name"
            type="text"
            autoComplete="off"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="e.g. floor tablet 1"
            className="h-11"
            disabled={submitting}
          />
        </div>

        {error && <p className="text-meta text-destructive">{error}</p>}

        <Button type="submit" variant="outline" size="lg" className="w-full" disabled={submitting || !code.trim()}>
          {submitting ? (
            <>
              <Loader2 className="animate-spin" />
              Enrolling…
            </>
          ) : (
            "Enroll device"
          )}
        </Button>
      </form>
    </AuthSplitLayout>
  );
}
