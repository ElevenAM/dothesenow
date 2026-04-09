/**
 * Durable rate limiter backed by Upstash Redis.
 * Used for all /api/v1/ endpoints. Unlike the in-memory limiter,
 * this persists across Vercel serverless cold starts.
 *
 * Env vars required: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/** 100 requests per 60-second sliding window, keyed by org_id */
export const apiRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "60 s"),
  prefix: "dtn:api:v1",
});

/**
 * Check rate limit for an org. Returns a 429 Response if exceeded.
 */
export async function checkApiRateLimit(
  orgId: string,
): Promise<Response | null> {
  const result = await apiRateLimiter.limit(orgId);

  if (!result.success) {
    const retryAfterSec = Math.ceil(result.reset - Date.now()) / 1000;
    return new Response(
      JSON.stringify({
        error: { code: "rate_limited", message: "Too many requests" },
        meta: { retry_after_seconds: Math.max(1, Math.ceil(retryAfterSec)) },
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.max(1, Math.ceil(retryAfterSec))),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": String(result.remaining),
          "X-RateLimit-Reset": String(result.reset),
        },
      },
    );
  }

  return null; // Allowed
}
