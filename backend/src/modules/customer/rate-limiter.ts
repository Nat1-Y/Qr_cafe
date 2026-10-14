import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

export interface RateRule {
  /** Max hits allowed inside the window. */
  limit: number;
  windowMs: number;
}

// Guest-facing limits. Per IP *and* per session, so one phone can't flood a
// branch and a crowd behind one café Wi-Fi IP still gets a fair share.
export const RATE_RULES = {
  orderPerSession: { limit: 5, windowMs: 10 * 60_000 },
  orderPerIp: { limit: 20, windowMs: 10 * 60_000 },
  menuPerIp: { limit: 30, windowMs: 60_000 },
  landingPerIp: { limit: 30, windowMs: 60_000 },
  readPerSession: { limit: 60, windowMs: 60_000 },
  assistPerSession: { limit: 1, windowMs: 60_000 },
} satisfies Record<string, RateRule>;

/**
 * In-memory sliding-window limiter. Good for a single backend instance (how
 * this API is deployed today). Running several instances behind a load
 * balancer would need a shared store (e.g. Redis) behind this same interface.
 */
@Injectable()
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;
  private readonly now: () => number;

  constructor(now?: () => number) {
    this.now = now ?? Date.now;
  }

  /** Records a hit; returns seconds to wait if it went over the limit, else 0. */
  hit(key: string, rule: RateRule): number {
    const now = this.now();
    this.sweep(now);
    const since = now - rule.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= rule.limit) {
      this.hits.set(key, list);
      return Math.max(1, Math.ceil((list[0] + rule.windowMs - now) / 1000));
    }
    list.push(now);
    this.hits.set(key, list);
    return 0;
  }

  /** Throws a friendly 429 when over the limit. */
  consume(key: string, rule: RateRule, message: string): void {
    const retryAfter = this.hit(key, rule);
    if (retryAfter > 0) {
      throw new HttpException(
        { statusCode: 429, message, retry_after: retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  reset(): void {
    this.hits.clear();
  }

  // Drop stale keys now and then so memory stays bounded.
  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    const maxWindow = 10 * 60_000;
    for (const [key, list] of this.hits) {
      if (!list.length || list[list.length - 1] < now - maxWindow) this.hits.delete(key);
    }
  }
}
