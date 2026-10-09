import { DeleteIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const KEY =
  "flex size-16 items-center justify-center rounded-full border border-border bg-card text-2xl font-medium text-foreground transition-colors outline-none hover:bg-row-hover active:bg-highlight focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 sm:size-[72px]";
const QUIET = "border-transparent bg-transparent text-muted-foreground hover:bg-muted";

/** PIN keypad with large round keys. */
export function PinKeypad({
  onDigit,
  onClear,
  onBackspace,
  disabled,
}: {
  onDigit: (digit: string) => void;
  onClear: () => void;
  onBackspace: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mx-auto grid w-fit grid-cols-3 gap-4">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button key={d} type="button" className={KEY} onClick={() => onDigit(d)} disabled={disabled}>
          {d}
        </button>
      ))}
      <button type="button" className={cn(KEY, QUIET, "text-sm font-semibold")} onClick={onClear} disabled={disabled}>
        Clear
      </button>
      <button type="button" className={KEY} onClick={() => onDigit("0")} disabled={disabled}>
        0
      </button>
      <button
        type="button"
        className={cn(KEY, QUIET)}
        onClick={onBackspace}
        disabled={disabled}
        aria-label="Delete last digit">
        <DeleteIcon className="size-6" />
      </button>
    </div>
  );
}

/** Row of PIN dots: outlined when empty, filled terracotta when entered. */
export function PinDots({ length, filled, className }: { length: number; filled: number; className?: string }) {
  return (
    <div className={cn("flex gap-3", className)} aria-label={`${filled} of ${length} digits entered`}>
      {Array.from({ length }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "size-3.5 rounded-full border-2 transition-colors",
            filled > i ? "border-primary bg-primary" : "border-input bg-transparent",
          )}
        />
      ))}
    </div>
  );
}
