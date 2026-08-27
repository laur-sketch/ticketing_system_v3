import { redisReady } from "@/lib/redis";

/**
 * Redis-backed fixed-window rate limiter.
 *
 * Fails open when Redis is unavailable so an outage never locks the whole
 * app down; callers should still prefer limiting abuse where it matters.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

const KEY_PREFIX = "rl:";

export async function rateLimit(opts: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const client = await redisReady();
  if (!client) {
    return { allowed: true, remaining: opts.limit, retryAfterSec: 0 };
  }
  try {
    const fullKey = KEY_PREFIX + opts.key;
    const count = await client.incr(fullKey);
    if (count === 1) {
      await client.expire(fullKey, opts.windowSeconds);
    }
    const allowed = count <= opts.limit;
    const remaining = Math.max(0, opts.limit - count);
    const retryAfterSec = allowed ? 0 : Math.max(1, await client.ttl(fullKey));
    return { allowed, remaining, retryAfterSec };
  } catch {
    return { allowed: true, remaining: opts.limit, retryAfterSec: 0 };
  }
}

/** Best-effort client IP for rate-limit keys (proxy headers first). */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-host") ??
    "unknown"
  );
}
