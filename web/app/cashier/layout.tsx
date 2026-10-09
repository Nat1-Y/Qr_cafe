import React from "react";
import type { Metadata } from "next";
import { CashierAuthProvider } from "@/components/cashier/auth-context";

// Advertise a cashier-scoped manifest for pages under /cashier so that
// installing from the cashier portal produces a separate app that launches
// straight into /cashier (distinct `id`/`start_url`/`scope`), instead of the
// root system app or the waiter app. Nested-route metadata overrides the root
// manifest link (see app/manifest.ts). The shared service worker registered in
// the root layout (public/sw.js, scope "/") already covers /cashier, which is
// what lets the browser offer "Install app".
export const metadata: Metadata = {
  manifest: "/cashier.webmanifest",
};

// Root of the cashier portal. Cashier auth lives in its own provider, separate
// from both the platform-admin session and the waiter session.
export default function CashierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-body">
      <CashierAuthProvider>{children}</CashierAuthProvider>
    </div>
  );
}
