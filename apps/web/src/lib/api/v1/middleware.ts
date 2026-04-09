/**
 * Shared middleware for all /api/v1/ endpoints.
 * Handles: Bearer auth via API key, scope check, Upstash rate limiting, standard envelope.
 */

import { validateApiKey } from "@dothesenow/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkApiRateLimit } from "@/lib/rate-limit-upstash";

// ─── Types ─────────────────────────────────────────────────

export interface ApiAuthResult {
  orgId: string;
  keyId: string;
  scopes: string[];
}

// ─── Auth + Rate Limit ─────────────────────────────────────

/**
 * Authenticate an API request and check rate limits.
 * Returns ApiAuthResult on success, or an error Response.
 */
export async function authenticateApiRequest(
  request: Request,
  requiredScope: string,
): Promise<ApiAuthResult | Response> {
  // Extract Bearer token
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return apiError("unauthorized", "Missing Authorization header", 401);
  }

  // Validate API key
  const adminClient = createAdminClient();
  let result: Awaited<ReturnType<typeof validateApiKey>>;
  try {
    result = await validateApiKey(adminClient, token);
  } catch {
    return apiError("service_unavailable", "Service temporarily unavailable", 503);
  }

  if (!result) {
    return apiError("unauthorized", "Invalid or revoked API key", 401);
  }

  // Check scope
  const scopes = result.scopes ?? ["mcp"];
  if (!scopes.includes(requiredScope)) {
    return apiError(
      "forbidden",
      `API key does not have required scope: ${requiredScope}`,
      403,
    );
  }

  // Rate limit check (Upstash)
  const rateLimitResponse = await checkApiRateLimit(result.orgId);
  if (rateLimitResponse) return rateLimitResponse;

  return {
    orgId: result.orgId,
    keyId: result.keyId,
    scopes,
  };
}

// ─── Response helpers ──────────────────────────────────────

export function apiResponse<T>(
  data: T,
  meta: { org_id: string; request_id?: string },
  status = 200,
): Response {
  return new Response(
    JSON.stringify({
      data,
      meta: {
        org_id: meta.org_id,
        request_id: meta.request_id ?? crypto.randomUUID(),
      },
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export function apiError(
  code: string,
  message: string,
  status: number,
): Response {
  return new Response(
    JSON.stringify({
      error: { code, message },
      meta: { request_id: crypto.randomUUID() },
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}
