/**
 * Simple in-memory sliding window rate limiter for serverless API routes.
 * Each limiter instance tracks requests per key (e.g., org_id) within a window.
 *
 * Note: In-memory state resets on cold starts. This is acceptable for
 * burst protection — persistent rate limiting would require Redis/Upstash.
 */

interface RateLimitEntry {
  timestamps: number[];
}

export function createRateLimiter(opts: {
  windowMs: number;
  maxRequests: number;
}) {
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup to prevent memory leaks on long-running instances
  const CLEANUP_INTERVAL = 60_000;
  let lastCleanup = Date.now();

  function cleanup(now: number) {
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter(
        (t) => now - t < opts.windowMs,
      );
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }

  return {
    /** Returns { allowed: true } or { allowed: false, retryAfterMs } */
    check(key: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
      const now = Date.now();
      cleanup(now);

      let entry = store.get(key);
      if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
      }

      // Remove timestamps outside the window
      entry.timestamps = entry.timestamps.filter(
        (t) => now - t < opts.windowMs,
      );

      if (entry.timestamps.length >= opts.maxRequests) {
        const oldestInWindow = entry.timestamps[0];
        const retryAfterMs = opts.windowMs - (now - oldestInWindow);
        return { allowed: false, retryAfterMs };
      }

      entry.timestamps.push(now);
      return { allowed: true };
    },
  };
}

/** Build a 429 Response with Retry-After header */
export function rateLimitResponse(retryAfterMs: number): Response {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  return new Response(
    JSON.stringify({ error: "Too many requests", retry_after_seconds: retryAfterSec }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}
