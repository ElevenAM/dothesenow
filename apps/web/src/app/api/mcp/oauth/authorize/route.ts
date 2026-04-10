import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMcpOAuthConfig,
  AUTH_CODE_TTL_MINUTES,
} from "@/lib/mcp-oauth/config";
import { getOAuthClient } from "@dothesenow/queries";

const COOKIE_NAME = "dtn_mcp_oauth_params";

/**
 * OAuth 2.1 Authorization Endpoint.
 *
 * Validates the incoming authorize request against the registered DCR client,
 * stores params in a signed cookie, and redirects to the consent page.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const responseType = params.get("response_type");
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");
  const state = params.get("state");
  const scope = params.get("scope") || "mcp";

  // ─── Validation ────────────────────────────────────────────────

  if (responseType !== "code") {
    return errorRedirect(redirectUri, state, "unsupported_response_type");
  }

  let config: ReturnType<typeof getMcpOAuthConfig>;
  try {
    config = getMcpOAuthConfig();
  } catch {
    return Response.json(
      { error: "server_error", error_description: "OAuth not configured" },
      { status: 500 },
    );
  }

  if (!clientId) {
    return errorRedirect(redirectUri, state, "invalid_request", "Missing client_id");
  }

  // Look up the registered client via DCR
  const adminClient = createAdminClient();
  let registeredClient: Awaited<ReturnType<typeof getOAuthClient>>;
  try {
    registeredClient = await getOAuthClient(adminClient, clientId);
  } catch {
    return Response.json(
      { error: "server_error", error_description: "Service temporarily unavailable" },
      { status: 503 },
    );
  }

  if (!registeredClient) {
    return errorRedirect(redirectUri, state, "invalid_request", "Unknown client_id");
  }

  // Validate redirect_uri against the client's registered URIs
  if (!redirectUri || !registeredClient.redirectUris.includes(redirectUri)) {
    return Response.json(
      { error: "invalid_request", error_description: "Invalid redirect_uri" },
      { status: 400 },
    );
  }

  if (codeChallengeMethod !== "S256") {
    return errorRedirect(redirectUri, state, "invalid_request", "code_challenge_method must be S256");
  }

  if (!codeChallenge) {
    return errorRedirect(redirectUri, state, "invalid_request", "code_challenge is required");
  }

  // ─── Store params in signed cookie ─────────────────────────────

  const payload = JSON.stringify({
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    state: state || "",
    scope,
    exp: Date.now() + AUTH_CODE_TTL_MINUTES * 60 * 1000,
  });

  const signature = createHmac("sha256", config.paramsSecret)
    .update(payload)
    .digest("hex");

  const cookieValue = `${Buffer.from(payload).toString("base64url")}.${signature}`;

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_CODE_TTL_MINUTES * 60,
  });

  // Redirect to the consent page
  const consentUrl = new URL("/oauth/authorize", request.nextUrl.origin);
  return NextResponse.redirect(consentUrl);
}

// ─── Helpers ────────────────────────────────────────────────────

function errorRedirect(
  redirectUri: string | null,
  state: string | null,
  error: string,
  description?: string,
): Response {
  // Only redirect to known URIs to prevent open redirects
  if (!redirectUri) {
    return Response.json(
      { error, error_description: description },
      { status: 400 },
    );
  }

  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (description) url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}

// ─── Cookie parsing (used by consent page) ──────────────────────

export interface OAuthParams {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  state: string;
  scope: string;
}

/**
 * Read and verify the signed OAuth params cookie.
 * Returns null if missing, tampered, or expired.
 */
export function readOAuthParamsCookie(
  cookieValue: string | undefined,
  paramsSecret: string,
): OAuthParams | null {
  if (!cookieValue) return null;

  const dotIndex = cookieValue.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const encodedPayload = cookieValue.slice(0, dotIndex);
  const signature = cookieValue.slice(dotIndex + 1);

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString();
  } catch {
    return null;
  }

  // Verify signature (timing-safe comparison)
  const expectedSig = createHmac("sha256", paramsSecret)
    .update(payload)
    .digest("hex");

  try {
    const sigBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  // Parse payload (wrapped in try/catch for corrupt base64-decodable data)
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  // Check expiry
  if (typeof parsed.exp === "number" && parsed.exp < Date.now()) return null;

  return {
    client_id: parsed.client_id as string,
    redirect_uri: parsed.redirect_uri as string,
    code_challenge: parsed.code_challenge as string,
    code_challenge_method: parsed.code_challenge_method as string,
    state: parsed.state as string,
    scope: parsed.scope as string,
  };
}
