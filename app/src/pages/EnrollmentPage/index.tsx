import React, { useCallback, useEffect, useState } from 'react';
import { WifiOff, RefreshCw, Loader2 } from 'lucide-react';
import syncEngine from '@/infrastructure/sync/sync-engine';
import { enrollDevice } from '@/infrastructure/api/device-enrollment';

import AuthSplitLayout from '@/components/layout/AuthSplitLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
interface EnrollmentPageProps {
  /** Called once the device has successfully redeemed a code for a token. */
  onEnrolled: () => void;
}

/**
 * First-run screen shown when the desktop app has no device token yet. The
 * operator pastes the one-time enrollment code minted by an owner/platform admin
 * for a specific branch; redeeming it stores a long-lived token that pins all
 * subsequent traffic to that branch.
 */
const EnrollmentPage: React.FC<EnrollmentPageProps> = ({ onEnrolled }) => {
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Online gate (mirrors LoginPage) ───────────────────────────────────────
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [checkingConn, setCheckingConn] = useState<boolean>(true);

  const checkConnection = useCallback(async () => {
    setCheckingConn(true);
    const online = await syncEngine.verifyConnection();
    setIsOnline(online);
    setCheckingConn(false);
  }, []);

  useEffect(() => {
    checkConnection();
    const timer = setInterval(checkConnection, 10_000);
    const handleOnline = () => checkConnection();
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkConnection]);
  // ───────────────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline || submitting) return;

    const trimmed = code.trim();
    if (!trimmed) {
      setError('Please enter the enrollment code.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await enrollDevice(trimmed, deviceName);
      onEnrolled();
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Enrollment failed. Check the code and try again.';
      setError(Array.isArray(message) ? message.join(', ') : message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthSplitLayout
      headline="Link this till to its branch."
      subline="You only do this once per device. Ask your manager for the enrollment code."
    >
      {!isOnline && (
        <div className="mb-6 flex items-start gap-3 rounded-card bg-destructive-soft px-4 py-3 text-destructive animate-fade-in">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">No internet connection</p>
            <p className="mt-0.5 text-meta">Enrolling needs a connection. Connect and try again.</p>
          </div>
          <button
            onClick={checkConnection}
            disabled={checkingConn}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-destructive/10 disabled:opacity-50"
            title="Retry connection"
            aria-label="Retry connection"
          >
            <RefreshCw className={`h-4 w-4 ${checkingConn ? 'animate-spin' : ''}`} />
          </button>
        </div>
      )}

      <div className="mb-8">
        <p className="eyebrow mb-1">First-time setup</p>
        <h1 className="text-title text-foreground">Set up this device</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the code from your administrator to link this device to its branch.
        </p>
      </div>

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
            className="h-12 text-center text-lg font-semibold tracking-[0.2em]"
            disabled={!isOnline || submitting}
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
            placeholder="e.g. Front counter"
            className="h-11"
            disabled={!isOnline || submitting}
          />
        </div>

        {error && <p className="text-meta text-destructive">{error}</p>}

        <Button
          type="submit"
          size="charge"
          className="w-full"
          disabled={!isOnline || submitting || !code.trim()}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Enrolling…
            </>
          ) : (
            'Enroll device'
          )}
        </Button>
      </form>
    </AuthSplitLayout>
  );
};

export default EnrollmentPage;
