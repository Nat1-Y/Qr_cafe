"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EyeIcon, EyeOffIcon, MonitorSmartphoneIcon, QrCodeIcon, XIcon } from "lucide-react";
import { Scanner, type IDetectedBarcode } from "@yudiel/react-qr-scanner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { operatorLogin } from "@/lib/auth";
import { landingRoute } from "@/lib/permissions";
import { AuthSplitLayout } from "@/components/auth-split-layout";
import {
  clearDeviceEnrollment,
  enrollDevice,
  getDeviceEnrollment,
  type DeviceEnrollment,
} from "@/lib/device";

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

export default function BranchLoginPage() {
  const router = useRouter();

  // Device enrollment must happen before anyone can sign in here — the device
  // token pins this browser to a branch so the backend can resolve the operator.
  const [enrollment, setEnrollment] = useState<DeviceEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [scanning, setScanning] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setEnrollment(getDeviceEnrollment());
  }, []);

  async function enroll(rawCode: string) {
    const trimmed = rawCode.trim();
    if (!trimmed || enrolling) return;
    setEnrolling(true);
    try {
      const result = await enrollDevice(trimmed, deviceName);
      setEnrollment(result);
      setCode("");
      setDeviceName("");
      toast.success("Device enrolled — you can now sign in.");
    } catch (err: any) {
      toast.error(err.message || "Enrollment failed");
    } finally {
      setEnrolling(false);
    }
  }

  function onEnroll(e: React.FormEvent) {
    e.preventDefault();
    enroll(code);
  }

  // A successful scan fills the code and immediately redeems it — point the
  // camera at the QR shown in the admin dashboard's Devices page.
  function onScan(results: IDetectedBarcode[]) {
    const raw = results?.[0]?.rawValue;
    if (!raw) return;
    const scanned = extractCode(raw).toUpperCase();
    setScanning(false);
    setCode(scanned);
    enroll(scanned);
  }

  function onChangeDevice() {
    clearDeviceEnrollment();
    setEnrollment(null);
    toast.success("Device removed — enter a new enrollment code.");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await operatorLogin(username.trim(), password);
      toast.success("Welcome back");
      router.push(landingRoute(user.role));
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplitLayout
      headline="Your branch, from the back office."
      subline="Set this device up once, then sign in to look after orders, menu, staff and reports.">
      {enrollment ? (
        <>
          <div className="mb-8">
            <h1 className="text-title text-foreground">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Branch admins and F&amp;B managers sign in here.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. hana"
                autoComplete="username"
                className="h-11"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-11 pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}>
                  {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" size="charge" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <MonitorSmartphoneIcon className="size-4 shrink-0 text-accent" />
              <span className="truncate">
                This device
                {enrollment.deviceName ? (
                  <span className="text-foreground"> · {enrollment.deviceName}</span>
                ) : null}
              </span>
            </span>
            <button
              type="button"
              onClick={onChangeDevice}
              className="shrink-0 rounded-full px-2 py-1 text-meta text-muted-foreground transition-colors hover:text-destructive">
              Change device
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-8">
            <p className="eyebrow mb-1">First-time setup</p>
            <h1 className="text-title text-foreground">Set up this device</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Scan the QR code from your owner or admin, or type the enrollment code.
            </p>
          </div>

          {scanning ? (
            <div className="mb-5 space-y-3">
              <div className="overflow-hidden rounded-card border border-border bg-sidebar">
                <Scanner
                  onScan={onScan}
                  onError={() =>
                    toast.error(
                      "Couldn't access the camera. Allow camera access or enter the code manually.",
                    )
                  }
                  formats={["qr_code"]}
                  components={{ finder: true }}
                  styles={{ container: { width: "100%" } }}
                />
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={() => setScanning(false)}>
                <XIcon />
                Cancel scan
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="lg"
              className="mb-5 w-full"
              disabled={enrolling}
              onClick={() => setScanning(true)}>
              <QrCodeIcon />
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

          <form onSubmit={onEnroll} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="enroll-code">Enrollment code</Label>
              <Input
                id="enroll-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="A1B2C3D4E5F6"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                className="h-12 text-center text-lg font-semibold tracking-[0.2em]"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="enroll-name">
                Device name <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="enroll-name"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. Manager laptop"
                autoComplete="off"
                className="h-11"
              />
            </div>
            <Button type="submit" variant="outline" size="lg" className="w-full" disabled={enrolling || !code.trim()}>
              {enrolling ? "Enrolling…" : "Enroll device"}
            </Button>
          </form>
        </>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        Owner or platform admin?{" "}
        <Link href="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
          Owner sign-in
        </Link>
      </p>
    </AuthSplitLayout>
  );
}
