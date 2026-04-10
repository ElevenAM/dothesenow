import { createAdminClient } from "@/lib/supabase/admin";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { ALLOWED_REDIRECT_URIS } from "@/lib/mcp-oauth/config";
import {
  generateClientId,
  generateClientSecret,
  hashToken,
  insertOAuthClient,
} from "@dothesenow/queries";

export const dynamic = "force-dynamic";

/** 5 registrations per minute per IP — tight limit for a public endpoint. */
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 5 });

/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591).
 *
 * MCP clients (e.g. Claude) call this endpoint to register themselves
 * before starting the authorization flow. Returns a client_id + client_secret.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = limiter.check(ip);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_client_metadata", "Malformed JSON body");
  }

  const clientName = typeof body.client_name === "string" ? body.client_name : "MCP Client";
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  const grantTypes = Array.isArray(body.grant_types)
    ? body.grant_types
    : ["authorization_code", "refresh_token"];
  const tokenEndpointAuthMethod =
    typeof body.token_endpoint_auth_method === "string"
      ? body.token_endpoint_auth_method
      : "client_secret_post";

  // Validate redirect_uris — every URI must be in the allowlist
  if (redirectUris.length === 0) {
    return errorResponse(400, "invalid_redirect_uri", "At least one redirect_uri is required");
  }

  for (const uri of redirectUris) {
    if (typeof uri !== "string" || !ALLOWED_REDIRECT_URIS.includes(uri)) {
      return errorResponse(
        400,
        "invalid_redirect_uri",
        `Redirect URI not allowed: ${uri}`,
      );
    }
  }

  // Generate credentials
  const clientId = generateClientId();
  const clientSecret = generateClientSecret();
  const secretHash = hashToken(clientSecret);

  const adminClient = createAdminClient();

  try {
    await insertOAuthClient(adminClient, {
      clientId,
      secretHash,
      clientName,
      redirectUris: redirectUris as string[],
      grantTypes: grantTypes as string[],
      tokenEndpointAuthMethod,
    });
  } catch (err) {
    console.error("[mcp-oauth:register] Failed to insert client:", err);
    return errorResponse(500, "server_error", "Failed to register client");
  }

  return Response.json(
    {
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      response_types: ["code"],
      token_endpoint_auth_method: tokenEndpointAuthMethod,
    },
    {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

// CORS preflight for cross-origin DCR requests
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function errorResponse(status: number, error: string, description: string): Response {
  return Response.json(
    { error, error_description: description },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
