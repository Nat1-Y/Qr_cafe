/** True for the guest ordering app (`/t/<qr token>`). */
export function isGuestPath(pathname: string | null | undefined): boolean {
  return pathname != null && pathname.startsWith("/t/");
}
