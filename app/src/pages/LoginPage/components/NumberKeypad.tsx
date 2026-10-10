import React from 'react';
import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NumberKeypadProps {
  onNumberInput: (digit: string) => void;
  onClear: () => void;
  onBackspace: () => void;
  isLoading: boolean;
}

const KEY =
  'flex h-16 w-16 items-center justify-center rounded-full border border-border bg-card text-2xl font-medium text-foreground transition-colors hover:bg-row-hover active:bg-highlight focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 sm:h-[72px] sm:w-[72px]';
const QUIET_KEY = 'border-transparent bg-transparent text-muted-foreground hover:bg-muted';

/** PIN keypad with large round keys. */
export const NumberKeypad: React.FC<NumberKeypadProps> = ({
  onNumberInput,
  onClear,
  onBackspace,
  isLoading
}) => (
  <div className="mx-auto grid w-fit grid-cols-3 gap-4">
    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
      <button key={d} type="button" className={KEY} onClick={() => onNumberInput(d)} disabled={isLoading}>
        {d}
      </button>
    ))}
    <button type="button" className={cn(KEY, QUIET_KEY, 'text-sm font-semibold')} onClick={onClear} disabled={isLoading}>
      Clear
    </button>
    <button type="button" className={KEY} onClick={() => onNumberInput('0')} disabled={isLoading}>
      0
    </button>
    <button
      type="button"
      className={cn(KEY, QUIET_KEY)}
      onClick={onBackspace}
      disabled={isLoading}
      aria-label="Delete last number"
    >
      <Delete className="h-6 w-6" />
    </button>
  </div>
);
