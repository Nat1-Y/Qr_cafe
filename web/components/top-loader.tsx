"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { isGuestPath } from "@/lib/customer/paths";

// Loaded after hydration, and never on the guest app (a single screen with no
// page-to-page navigation), so guests' phones don't download it.
const NextTopLoader = dynamic(() => import("nextjs-toploader"), { ssr: false });

export function TopLoader() {
  const pathname = usePathname();
  if (isGuestPath(pathname)) return null;
  return <NextTopLoader color="var(--primary)" showSpinner={false} height={2} shadow={false} />;
}
