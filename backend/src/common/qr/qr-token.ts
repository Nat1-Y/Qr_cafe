import { createHash, randomBytes } from "crypto";

// Table QR tokens are the *only* thing a guest's phone presents, so they double
// as the tenant credential for the public customer API. 32 random bytes (256
// bits) as base64url: unguessable, URL-safe, 43 chars. Never derived from the
// table id or number, so tokens can't be enumerated.
export function generateQrToken(): string {
  return randomBytes(32).toString("base64url");
}

// Same shape for the per-scan customer session token the browser keeps. Only a
// hash of it is stored (customer_sessions.token_hash), so a DB read can't be
// replayed as a live session.
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Cheap shape check before touching the DB: base64url only, sane length. Keeps
// junk (and anything with SQL-ish characters) out of the lookup entirely.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,64}$/;

export function isWellFormedToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_SHAPE.test(value);
}
