import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ButtonSpinner } from '@/components/common/LoadingSpinner';
import { cn } from '@/lib/utils';
import { getRoleLabel, getUserInitials } from '../utils';
import { NumberKeypad } from './NumberKeypad';

interface PinEntryScreenProps {
  selectedUser: any;
  formData: { username: string; pin: string };
  errors: Record<string, string>;
  isLoading: boolean;
  disabled?: boolean;
  onUsernameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPinInput: (digit: string) => void;
  onPinClear: () => void;
  onPinBackspace: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  usernameRef: React.RefObject<HTMLInputElement | null>;
  pinRef?: React.RefObject<HTMLInputElement | null>;
}

export const PinEntryScreen: React.FC<PinEntryScreenProps> = ({
  selectedUser,
  formData,
  errors,
  isLoading,
  disabled = false,
  onUsernameChange,
  onPinInput,
  onPinClear,
  onPinBackspace,
  onSubmit,
  onBack,
  usernameRef,
}) => {
  const [triggerShake, setTriggerShake] = useState(false);

  // Shake the PIN dots when the PIN is rejected.
  useEffect(() => {
    if (errors.pin) {
      setTriggerShake(true);
      const timer = setTimeout(() => setTriggerShake(false), 500);
      return () => clearTimeout(timer);
    }
  }, [errors.pin]);

  const name = selectedUser?.full_name || selectedUser?.name || selectedUser?.username || '';
  const busy = isLoading || disabled;

  return (
    <div className="animate-fade-in">
      <style>{`
        @keyframes pin-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .animate-pin-shake { animation: pin-shake 0.4s ease-in-out; }
      `}</style>

      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        className="-ml-3 mb-6 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Not you?
      </button>

      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-highlight text-lg font-semibold text-highlight-foreground">
          {getUserInitials(name)}
        </span>
        <div className="min-w-0">
          <p className="eyebrow">{getRoleLabel(String(selectedUser?.role || ''))}</p>
          <p className="truncate text-section text-foreground">{name}</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-8">
        {/* Hidden username keeps autofill working */}
        <div className="hidden">
          <Input
            id="username"
            type="text"
            ref={usernameRef}
            value={formData.username}
            onChange={onUsernameChange}
            disabled={busy}
            autoComplete="username"
          />
        </div>

        <div className={cn(triggerShake && 'animate-pin-shake')}>
          <p className="mb-3 text-sm font-medium text-foreground">Enter your 4-digit PIN</p>
          <div className="flex gap-3" aria-label={`${formData.pin.length} of 4 digits entered`}>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  'h-3.5 w-3.5 rounded-full border-2 transition-colors',
                  formData.pin.length > i ? 'border-primary bg-primary' : 'border-input bg-transparent'
                )}
              />
            ))}
          </div>
          {errors.pin && <p className="mt-2 text-meta text-destructive">{errors.pin}</p>}
        </div>

        <NumberKeypad
          onNumberInput={onPinInput}
          onClear={onPinClear}
          onBackspace={onPinBackspace}
          isLoading={busy}
        />

        <Button
          type="submit"
          size="charge"
          className="w-full"
          disabled={busy || !formData.username || formData.pin.length !== 4}
        >
          {isLoading ? (
            <>
              <ButtonSpinner />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>
    </div>
  );
};
