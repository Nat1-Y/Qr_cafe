import { DisabledProvider } from "./stub-provider";

/**
 * CBE Birr (Commercial Bank of Ethiopia) — USSD/app push to the guest's phone. DISABLED until built.
 *
 * TODO(cbe_birr): to enable
 *   Env: CBE_BIRR_MERCHANT_ID, CBE_BIRR_API_KEY, CBE_BIRR_SECRET (HMAC key for
 *        callbacks), CBE_BIRR_BASE_URL
 *   isEnabled(branchId): env present AND an active payment_methods row "cbe_birr".
 *   createIntent: request a payment push to customer.phone (required for this
 *     provider — ask for it in the pay step) with reference = intentId and the
 *     amount in birr → { status: "pending", providerRef, instructions:
 *     "Check your phone and approve the CBE Birr payment." }.
 *   handleWebhook: verify the callback signature (HMAC over req.rawBody with
 *     CBE_BIRR_SECRET, timingSafeEqual) BEFORE reading fields; confirm with a
 *     status query → { ref: providerRef, by: "provider_ref", status }.
 */
export class CbeBirrProvider extends DisabledProvider {
  readonly id = "cbe_birr" as const;
  readonly displayName = "CBE Birr";
}
