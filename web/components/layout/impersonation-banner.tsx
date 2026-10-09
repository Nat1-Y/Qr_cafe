"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getUser, isImpersonating, returnToAdmin } from "@/lib/auth";

// Shown across the whole dashboard while a super admin is signed in as a
// business owner (see lib/auth.ts impersonateOwner/returnToAdmin), so they
// can never lose track of whose session they're in.
export function ImpersonationBanner() {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [username, setUsername] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setActive(isImpersonating());
    setUsername(getUser()?.username);
  }, []);

  if (!active) return null;

  async function onReturn() {
    setBusy(true);
    try {
      await returnToAdmin();
      router.push("/dashboard/businesses");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-500/90 px-4 py-2 text-sm font-medium text-amber-950">
      <ShieldAlertIcon className="size-4 shrink-0" />
      <span>
        Signed in as <span className="font-semibold">{username}</span> on
        behalf of the platform admin
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-amber-950/30 bg-transparent text-amber-950 hover:bg-amber-950/10"
        disabled={busy}
        onClick={onReturn}>
        Return to admin
      </Button>
    </div>
  );
}
