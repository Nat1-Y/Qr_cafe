import { CustomerApp } from "@/components/customer/CustomerApp";
import type { PublicInfo } from "@/lib/customer/types";

// Server-side base URL for the API (inside Docker/a private network this is
// usually different from the browser's NEXT_PUBLIC_API_URL).
const API = (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api").replace(
  /\/+$/,
  "",
);

/**
 * The welcome screen's info (café, table, open/closed), fetched here so it's in
 * the first HTML — the guest sees it before any JavaScript runs. Cached for
 * 30s per table. On any failure the client app fetches it itself.
 */
async function loadInfo(token: string): Promise<{ info: PublicInfo | null; broken: boolean }> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { info: null, broken: true };
  try {
    const res = await fetch(`${API}/public/t/${encodeURIComponent(token)}/info`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(2500),
    });
    if (res.status === 404) return { info: null, broken: true };
    if (!res.ok) return { info: null, broken: false };
    const body = (await res.json()) as { data?: PublicInfo };
    return { info: body.data ?? null, broken: false };
  } catch {
    return { info: null, broken: false };
  }
}

export default async function GuestOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { info, broken } = await loadInfo(token);
  return <CustomerApp token={token} initialInfo={info} initialBroken={broken} />;
}
