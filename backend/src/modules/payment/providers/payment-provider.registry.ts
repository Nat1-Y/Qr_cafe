import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { db } from "../../../db/drizzle";
import { paymentMethods } from "../../../db/tables/payment_methods.table";
import type { PaymentProvider, PaymentProviderId } from "./payment-provider";
import { CounterProvider } from "./counter.provider";
import { TelebirrProvider } from "./telebirr.provider";
import { ChapaProvider } from "./chapa.provider";
import { CbeBirrProvider } from "./cbe-birr.provider";

export interface ProviderOption {
  id: PaymentProviderId;
  name: string;
}

/**
 * Owner switch for an online provider: an active payment_methods row with the
 * provider's id as its name (the same rows the cashier's method picker uses).
 * Real adapters call this from isEnabled(); the counter is always on.
 */
export async function isMethodActive(branchId: string, name: string): Promise<boolean> {
  const [row] = await db
    .select({ active: paymentMethods.is_active })
    .from(paymentMethods)
    .where(and(eq(paymentMethods.branch_id, branchId), eq(paymentMethods.name, name)))
    .limit(1);
  return row?.active === true;
}

/** Every way a guest can pay, by id. Injectable so tests can register fakes. */
@Injectable()
export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  constructor() {
    for (const p of [
      new CounterProvider(),
      new TelebirrProvider(),
      new ChapaProvider(),
      new CbeBirrProvider(),
    ]) {
      this.register(p);
    }
  }

  register(provider: PaymentProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): PaymentProvider | null {
    return this.providers.get(id) ?? null;
  }

  all(): PaymentProvider[] {
    return [...this.providers.values()];
  }

  /** Only what this branch can actually use, counter first. */
  async enabledOptions(branchId: string): Promise<ProviderOption[]> {
    const out: ProviderOption[] = [];
    for (const p of this.providers.values()) {
      if (p.implemented && (await p.isEnabled(branchId))) out.push({ id: p.id, name: p.displayName });
    }
    return out.sort((a, b) => (a.id === "counter" ? -1 : b.id === "counter" ? 1 : 0));
  }

  /** For the owner's settings screen: every provider and whether it's built/on. */
  async describe(branchId: string) {
    const rows = [];
    for (const p of this.providers.values()) {
      rows.push({
        id: p.id,
        name: p.displayName,
        available: p.implemented,
        enabled: p.implemented && (await p.isEnabled(branchId)),
      });
    }
    return rows;
  }
}
