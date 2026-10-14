import type {
  CreateIntentInput,
  CreateIntentResult,
  PaymentIntentStatus,
  PaymentProvider,
  WebhookResult,
} from "./payment-provider";

/**
 * "Pay at the counter" — the only provider switched on today. Makes no
 * external call and writes no money: the guest is told to pay at the counter
 * and the cashier settles the order exactly as they always have
 * (PaymentService.create), so reports and the Z-report are unchanged.
 */
export class CounterProvider implements PaymentProvider {
  readonly id = "counter" as const;
  readonly displayName = "Pay at the counter";
  readonly implemented = true;
  readonly external = false;

  async isEnabled(): Promise<boolean> {
    return true;
  }

  async createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
    const number = input.orderNumber != null ? ` #${input.orderNumber}` : "";
    return {
      status: "pending",
      instructions: `Pay at the counter. Show your order number${number}.`,
    };
  }

  async getStatus(): Promise<PaymentIntentStatus> {
    // Settlement happens at the till; the order's payment_status is the truth.
    return "pending";
  }

  async handleWebhook(): Promise<WebhookResult | null> {
    return null; // no external party, so nothing can call back
  }
}
