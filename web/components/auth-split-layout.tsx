import { CoffeeIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-10 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
        <CoffeeIcon className="size-5" />
      </span>
      <span className="text-lg font-semibold">Buna POS</span>
    </div>
  );
}

/** Login / PIN / enrollment frame: terracotta brand panel left, cream form right. */
export function AuthSplitLayout({
  headline = "Open the till, take orders, close the day.",
  subline = "Sign in with the account your manager set up for you.",
  panel,
  children,
}: {
  headline?: React.ReactNode;
  subline?: React.ReactNode;
  /** Replaces the headline on the brand panel with something useful. */
  panel?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-background md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="hidden flex-col justify-between gap-8 bg-sidebar p-10 text-sidebar-foreground md:flex">
        <Wordmark />
        {panel ?? (
          <div className="max-w-sm">
            <p className="text-[34px] leading-[1.15] font-semibold tracking-[-0.02em]">{headline}</p>
            <p className="mt-4 text-base text-sidebar-muted">{subline}</p>
          </div>
        )}
        {/* Keeps the headline centred between the logo and the bottom edge. */}
        <span aria-hidden="true" />
      </aside>

      <main className="flex min-h-screen flex-col px-4 py-8 md:px-12">
        <Wordmark className="text-foreground md:hidden" />
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
