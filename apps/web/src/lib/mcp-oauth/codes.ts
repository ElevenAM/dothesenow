import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateAuthCode,
  hashToken,
  insertOAuthCode,
  claimOAuthCode,
} from "@dothesenow/queries";
import { verifyCodeChallenge } from "./pkce";
import { AUTH_CODE_TTL_MINUTES } from "./config";

/**
 * Create an authorization code for the OAuth consent flow.
 * Returns the raw code (shown once in the redirect URL).
 */
export async function createAuthorizationCode(
  adminClient: SupabaseClient,
  params: {
    clientId: string;
    userId: string;
    orgId: string;
    redirectUri: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    scopes: string[];
  },
): Promise<string> {
  const rawCode = generateAuthCode();
  const codeHash = hashToken(rawCode);

  const expiresAt = new Date(
    Date.now() + AUTH_CODE_TTL_MINUTES * 60 * 1000,
  ).toISOString();

  await insertOAuthCode(adminClient, {
    codeHash,
    clientId: params.clientId,
    userId: params.userId,
    orgId: params.orgId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    scopes: params.scopes,
    expiresAt,
  });

  return rawCode;
}

/**
 * Exchange an authorization code for user/org identity.
 * Atomically claims the code (prevents replay). Validates PKCE, client_id,
 * and redirect_uri.
 *
 * Returns identity on success, throws on any validation failure.
 */
export async function exchangeAuthorizationCode(
  adminClient: SupabaseClient,
  params: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
  },
): Promise<{ userId: string; orgId: string; scopes: string[] }> {
  const codeHash = hashToken(params.code);

  // Atomic claim — races will get null on the losing request
  const codeRow = await claimOAuthCode(adminClient, codeHash);

  if (!codeRow) {
    throw new Error("Invalid, expired, or already-used authorization code");
  }

  // Validate client_id
  if (codeRow.clientId !== params.clientId) {
    throw new Error("client_id mismatch");
  }

  // Validate redirect_uri (exact match)
  if (codeRow.redirectUri !== params.redirectUri) {
    throw new Error("redirect_uri mismatch");
  }

  // Validate PKCE
  if (!verifyCodeChallenge(params.codeVerifier, codeRow.codeChallenge)) {
    throw new Error("PKCE code_verifier does not match code_challenge");
  }

  return {
    userId: codeRow.userId,
    orgId: codeRow.orgId,
    scopes: codeRow.scopes,
  };
}
