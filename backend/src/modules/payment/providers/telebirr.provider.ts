import { DisabledProvider } from "./stub-provider";

/**
 * Telebirr (Ethio telecom) — H5 web checkout / in-app USSD push. DISABLED until built.
 *
 * TODO(telebirr): to enable
 *   Env: TELEBIRR_APP_ID, TELEBIRR_APP_KEY, TELEBIRR_SHORT_CODE,
 *        TELEBIRR_PUBLIC_KEY (Telebirr's RSA public key, PEM), TELEBIRR_PRIVATE_KEY
 *        (merchant RSA key for request signing), TELEBIRR_BASE_URL
 *   isEnabled(branchId): env present AND an active payment_methods row "telebirr".
 *   createIntent: build the order request (outTradeNo = intentId, totalAmount in
 *     birr, notifyUrl = <API>/api/public/payments/telebirr/webhook, returnUrl),
 *     sign it with the merchant private key, encrypt per Telebirr's spec, POST it.
 *     Redirect flow → { status: "pending", checkoutUrl: toPayUrl, providerRef: outTradeNo };
 *     USSD/app push → { status: "pending", instructions: "Approve the payment on your phone." }.
 *   handleWebhook: decrypt/verify the notification with TELEBIRR_PUBLIC_KEY
 *     (signature over the raw payload) BEFORE trusting any field; check
 *     totalAmount matches the intent; then query order status to confirm
 *     → { ref: outTradeNo, by: "intent_id", status }.
 */
export class TelebirrProvider extends DisabledProvider {
  readonly id = "telebirr" as const;
  readonly displayName = "Telebirr";
}
