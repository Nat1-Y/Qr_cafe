import { DisabledProvider } from "./stub-provider";

/**
 * Chapa — hosted checkout (redirect flow). DISABLED until built.
 *
 * TODO(chapa): to enable
 *   Env: CHAPA_SECRET_KEY, CHAPA_WEBHOOK_SECRET, CHAPA_BASE_URL (default https://api.chapa.co/v1)
 *   isEnabled(branchId): env present AND the branch has an active payment_methods
 *     row named "chapa" (isMethodActive in payment-provider.registry.ts).
 *   createIntent: POST {BASE}/transaction/initialize with
 *     { amount: centsToBirr(amountCents), currency, tx_ref: intentId,
 *       callback_url: <API>/api/public/payments/chapa/webhook, return_url: returnUrl,
 *       first_name/phone_number from customer }
 *     → { status: "pending", checkoutUrl: data.checkout_url, providerRef: intentId }
 *   getStatus: GET {BASE}/transaction/verify/{tx_ref} → map "success" → succeeded.
 *   handleWebhook: verify the `Chapa-Signature` / `x-chapa-signature` header =
 *     HMAC-SHA256(CHAPA_WEBHOOK_SECRET, req.rawBody) with timingSafeEqual BEFORE
 *     reading the body; then re-verify via getStatus (never trust the body alone)
 *     → { ref: tx_ref, by: "intent_id", status }.
 */
export class ChapaProvider extends DisabledProvider {
  readonly id = "chapa" as const;
  readonly displayName = "Chapa";
}
