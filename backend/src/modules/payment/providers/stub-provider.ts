import type {
  CreateIntentResult,
  PaymentIntentStatus,
  PaymentProvider,
  PaymentProviderId,
  WebhookResult,
} from "./payment-provider";

/**
 * Base for providers that aren't built yet. Disabled everywhere: isEnabled()
 * is false, and every money-moving call throws, so a misconfigured branch can
 * never take a payment through one by accident.
 */
export abstract class DisabledProvider implements PaymentProvider {
  abstract readonly id: PaymentProviderId;
  abstract readonly displayName: string;
  readonly implemented: boolean = false;
  readonly external: boolean = true;

  async isEnabled(): Promise<boolean> {
    return false;
  }

  async createIntent(): Promise<CreateIntentResult> {
    throw new Error(`${this.displayName} is not available yet.`);
  }

  async getStatus(): Promise<PaymentIntentStatus> {
    throw new Error(`${this.displayName} is not available yet.`);
  }

  async handleWebhook(): Promise<WebhookResult | null> {
    // Never trust an unverified body. Until signature checks exist, nothing is.
    return null;
  }
}
