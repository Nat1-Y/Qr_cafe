import { Suspense } from "react";
import { PrintCards } from "@/components/tables/PrintCards";

// Printable A6 table cards. Lives outside the dashboard chrome so only the
// cards print. /dashboard/* is still behind the owner sign-in (proxy.ts).
export const metadata = { title: "Table QR cards" };

export default function PrintCardsPage() {
  return (
    <Suspense>
      <PrintCards />
    </Suspense>
  );
}
