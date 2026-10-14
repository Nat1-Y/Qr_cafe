// The guest-facing QR ordering API lives under /api/public/*. Shared by the
// tenant middleware (no header/JWT tenant for these) and CORS (web origin only).
export const PUBLIC_API_PREFIX = "/api/public/";

export function isPublicUrl(url: string | undefined | null): boolean {
  return typeof url === "string" && url.startsWith(PUBLIC_API_PREFIX);
}

export function isPublicPath(req: { originalUrl?: string; url?: string }): boolean {
  return isPublicUrl(req.originalUrl ?? req.url);
}

/** Allowed browser origins for the public API, from WEB_ORIGIN (comma-separated). */
export function publicAllowedOrigins(): string[] {
  return String(process.env.WEB_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}
