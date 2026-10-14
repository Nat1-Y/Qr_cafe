import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";

// Guest QR ordering. Private to whoever scanned the table — never indexed.
export const metadata: Metadata = {
  title: "Order at your table",
  description: "Browse the menu and order from your table.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Order" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the layout reach under the notch / home bar; spacing uses safe-area insets.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND.canvas },
    { media: "(prefers-color-scheme: dark)", color: BRAND.canvasNight },
  ],
};

export default function GuestLayout({ children }: { children: ReactNode }) {
  return children;
}
