import { createAdminClient } from "@/lib/supabase/admin";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import {
  hashToken,
  getOAuthClient,
  constantTimeEqual,
} from "@dothesenow/queries";
import { exchangeAuthorizationCode } from "@/lib/mcp-oauth/codes";
import { generateTokenPair, refreshAccessToken } from "@/lib/mcp-oauth/tokens";

export const dynamic = "force-dynamic";

/** 10 requests per minute per client_id — tight limit for a public endpoint. */
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10 });

/**
 * OAuth 2.1 Token Endpoint.
 *
 * Supports:
 * - grant_type=authorization_code (with PKCE)
 * - grant_type=refresh_token (with full rotation)
 *
 * Client credentials are validated against DCR-registered clients in the DB.
 */
export async function POST(request: Request) {
  let body: URLSearchParams;
  try {
    const text = await request.text();
    body = new URLSearchParams(text);
  } catch {
    return errorResponse(400, "invalid_request", "Malformed request body");
  }

  const grantType = body.get("grant_type");
  const clientId = body.get("client_id") || "";

  // Rate limit by client_id (or "anonymous" if not provided)
  const rl = limiter.check(clientId || "anonymous");
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  // Look up the registered client from DCR
  const adminClient = createAdminClient();

  let registeredClient: Awaited<ReturnType<typeof getOAuthClient>>;
  try {
    registeredClient = await getOAuthClient(adminClient, clientId);
  } catch {
    return errorResponse(503, "server_error", "Service temporarily unavailable");
  }

  if (!registeredClient) {
    return errorResponse(401, "invalid_client", "Unknown client_id");
  }

  // Validate client_secret against the stored hash
  const clientSecret = body.get("client_secret") || "";
  const providedHash = hashToken(clientSecret);
  if (!constantTimeEqual(providedHash, registeredClient.secretHash)) {
    return errorResponse(401, "invalid_client", "Invalid client_secret");
  }

  if (grantType === "authorization_code") {
    return handleAuthCodeGrant(adminClient, body, clientId);
  }

  if (grantType === "refresh_token") {
    return handleRefreshGrant(adminClient, body, clientId);
  }

  return errorResponse(400, "unsupported_grant_type", `Unsupported grant_type: ${grantType}`);
}

// Also support CORS preflight for cross-origin token requests
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

// ─── Grant handlers ─────────────────────────────────────────────

async function handleAuthCodeGrant(
  adminClient: ReturnType<typeof createAdminClient>,
  body: URLSearchParams,
  clientId: string,
): Promise<Response> {
  const code = body.get("code");
  const redirectUri = body.get("redirect_uri");
  const codeVerifier = body.get("code_verifier");

  if (!code || !redirectUri || !codeVerifier) {
    return errorResponse(
      400,
      "invalid_request",
      "Missing code, redirect_uri, or code_verifier",
    );
  }

  try {
    const identity = await exchangeAuthorizationCode(adminClient, {
      code,
      clientId,
      redirectUri,
      codeVerifier,
    });

    const tokens = await generateTokenPair(adminClient, {
      clientId,
      userId: identity.userId,
      orgId: identity.orgId,
      scopes: identity.scopes,
    });

    return tokenResponse(tokens);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Code exchange failed";
    console.error("[mcp-oauth:token] auth code exchange failed:", message);
    return errorResponse(400, "invalid_grant", message);
  }
}

async function handleRefreshGrant(
  adminClient: ReturnType<typeof createAdminClient>,
  body: URLSearchParams,
  clientId: string,
): Promise<Response> {
  const refreshToken = body.get("refresh_token");

  if (!refreshToken) {
    return errorResponse(400, "invalid_request", "Missing refresh_token");
  }

  try {
    const tokens = await refreshAccessToken(adminClient, {
      refreshToken,
      clientId,
    });

    return tokenResponse(tokens);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    console.error("[mcp-oauth:token] refresh failed:", message);
    return errorResponse(400, "invalid_grant", message);
  }
}

// ─── Response helpers ───────────────────────────────────────────

function tokenResponse(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}): Response {
  return Response.json(
    {
      access_token: tokens.accessToken,
      token_type: "Bearer",
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      scope: tokens.scope,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

function errorResponse(
  status: number,
  error: string,
  description: string,
): Response {
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
