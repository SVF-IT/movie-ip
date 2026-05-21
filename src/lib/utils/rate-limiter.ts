interface BucketEntry {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private buckets = new Map<string, BucketEntry>();
  private maxTokens: number;
  private refillRateMs: number;

  constructor(maxTokens: number, refillIntervalMs: number) {
    this.maxTokens = maxTokens;
    this.refillRateMs = refillIntervalMs;
  }

  consume(key: string): boolean {
    const now = Date.now();
    let entry = this.buckets.get(key);

    if (!entry) {
      entry = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(key, entry);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - entry.lastRefill;
    const refilled = Math.floor(elapsed / this.refillRateMs);
    if (refilled > 0) {
      entry.tokens = Math.min(this.maxTokens, entry.tokens + refilled);
      entry.lastRefill = now;
    }

    if (entry.tokens <= 0) {
      return false;
    }

    entry.tokens -= 1;
    return true;
  }

  getRetryAfterSeconds(key: string): number {
    const entry = this.buckets.get(key);
    if (!entry || entry.tokens > 0) return 0;
    const elapsed = Date.now() - entry.lastRefill;
    const remaining = this.refillRateMs - elapsed;
    return Math.ceil(Math.max(remaining, 0) / 1000);
  }
}

// 5 login attempts, refill 1 token every 10 seconds
export const loginLimiter = new RateLimiter(5, 10_000);

// 20 admin actions, refill 1 token every second
export const adminLimiter = new RateLimiter(20, 1_000);
