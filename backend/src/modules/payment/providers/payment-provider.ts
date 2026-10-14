// The contract every way of paying for a QR order implements. Adding a real
// provider later (Telebirr, Chapa, CBE Birr) means filling in its adapter file
// in this folder plus its env vars — nothing else changes: the registry,
// webhook route, intent bookkeeping and settlement are shared.

export type PaymentProviderId = "counter" | "telebirr" | "chapa" | "cbe_birr";

export const PAYMENT_INTENT_STATUS = [
  "created",
  "pending",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
] as const;
export type PaymentIntentStatus = (typeof PAYMENT_INTENT_STATUS)[number];

/** Terminal states never move again — a late/replayed webhook is ignored. */
export const TERMINAL_INTENT_STATUS: ReadonlySet<PaymentIntentStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "expired",
]);

export interface CreateIntentInput {
  /** Our payment_intents.id — send it to the provider as the merchant reference. */
  intentId: string;
  orderId: string;
  orderNumber: number | null;
  amountCents: number;
  currency: string;
  customer?: { name?: string | null; phone?: string | null };
  returnUrl: string;
}

export interface CreateIntentResult {
  status: PaymentIntentStatus;
  /** The provider's own id for this payment, used to match webhooks. */
  providerRef?: string;
  /** Redirect flow (e.g. Chapa hosted checkout). */
  checkoutUrl?: string;
  /** What to tell the guest (e.g. "Pay at the counter…", or "Approve on your phone"). */
  instructions?: string;
  raw?: unknown;
}

/** The parts of an HTTP request a webhook handler needs — raw bytes for signatures. */
export interface RawRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer | undefined;
  body: unknown;
}

export interface WebhookResult {
  /** Our payment_intents.id or the provider_ref — see `by`. */
  ref: string;
  by: "intent_id" | "provider_ref";
  status: PaymentIntentStatus;
  raw?: unknown;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly displayName: string;
  /** Implemented and allowed to take money (stubs: false). */
  readonly implemented: boolean;
  /** Talks to an outside party, so each attempt is tracked as a payment_intents row. */
  readonly external: boolean;
  isEnabled(branchId: string): Promise<boolean>;
  createIntent(input: CreateIntentInput): Promise<CreateIntentResult>;
  getStatus(intent: { id: string; providerRef: string | null }): Promise<PaymentIntentStatus>;
  /** MUST verify the provider's signature; return null for anything unverified. */
  handleWebhook(req: RawRequest): Promise<WebhookResult | null>;
  refund?(intent: { id: string; providerRef: string | null }, amountCents?: number): Promise<void>;
}

/** 1 ETB = 100 cents. Orders/payments store whole birr. */
export const birrToCents = (birr: number) => Math.round(birr * 100);
export const centsToBirr = (cents: number) => cents / 100;
