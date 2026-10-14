"use client";

import type { ReactNode } from "react";
import { Dialog } from "radix-ui";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/customer/i18n";

/**
 * Phone-first bottom sheet: slides up from the thumb, rounded top, scrolls its
 * body, keeps a sticky footer above the home bar. Focus is trapped and Escape /
 * the overlay / the close button all dismiss it (Radix Dialog).
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hideTitle?: boolean;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[1.5rem] border-t border-border bg-card text-card-foreground shadow-pop outline-none",
            "duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-8 data-[state=closed]:fade-out-0 motion-reduce:animate-none",
            className,
          )}>
          <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-border" />
          {hideTitle ? <Dialog.Title className="sr-only">{title}</Dialog.Title> : null}
          <div className={cn("flex items-start justify-between gap-3 px-5 pt-3", hideTitle && "absolute top-3 right-0 z-10 pt-0")}>
            {hideTitle ? null : <Dialog.Title className="text-section text-foreground">{title}</Dialog.Title>}
            <Dialog.Close
              className={cn(
                "-mt-1 -mr-2 ml-auto flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none",
                hideTitle && "bg-card/90 shadow-pop backdrop-blur",
              )}
              aria-label={t("close")}>
              <XIcon className="size-5" />
            </Dialog.Close>
          </div>
          {description ? (
            <Dialog.Description className="px-5 text-meta text-muted-foreground">{description}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-4">{children}</div>
          {footer ? (
            <div className="shrink-0 border-t border-border bg-card px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
