import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgContext } from "./context.js";
import { QueryError } from "./errors.js";

const CLIENTS_TABLE = "dtn_mcp_oauth_clients";
const CODES_TABLE = "dtn_mcp_oauth_codes";
const TOKENS_TABLE = "dtn_mcp_oauth_tokens";

const CLIENT_ID_PREFIX = "dtn_oci_";
const CLIENT_SECRET_PREFIX = "dtn_ocs_";
const ACCESS_PREFIX = "dtn_oat_";
const REFRESH_PREFIX = "dtn_ort_";

// ─── Types ──────────────────────────────────────────────────────

export interface OAuthTokenRow {
  id: string;
  access_token_prefix: string;
  client_id: string;
  user_id: string;
  org_id: string;
  scopes: string[];
  access_expires_at: string;
  refresh_expires_at: string;
  is_revoked: boolean;
  last_used_at: string | null;
  created_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateAccessToken(): string {
  return ACCESS_PREFIX + randomBytes(16).toString("hex");
}

export function generateRefreshToken(): string {
  return REFRESH_PREFIX + randomBytes(16).toString("hex");
}

export function generateAuthCode(): string {
  return randomBytes(32).toString("hex");
}

export { CLIENT_ID_PREFIX, CLIENT_SECRET_PREFIX, ACCESS_PREFIX, REFRESH_PREFIX };

/**
 * Constant-time string comparison using SHA-256 hashes.
 * Safe to use with strings of any length — always compares 32-byte hashes.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

// ─── OAuth client registration (DCR) ─────────────────────────────

export function generateClientId(): string {
  return CLIENT_ID_PREFIX + randomBytes(16).toString("hex");
}

export function generateClientSecret(): string {
  return CLIENT_SECRET_PREFIX + randomBytes(32).toString("hex");
}

export async function insertOAuthClient(
  adminClient: SupabaseClient,
  data: {
    clientId: string;
    secretHash: string;
    clientName: string;
    redirectUris: string[];
    grantTypes: string[];
    tokenEndpointAuthMethod: string;
  },
): Promise<void> {
  const { error } = await adminClient.from(CLIENTS_TABLE).insert({
    client_id: data.clientId,
    secret_hash: data.secretHash,
    client_name: data.clientName,
    redirect_uris: data.redirectUris,
    grant_types: data.grantTypes,
    token_endpoint_auth_method: data.tokenEndpointAuthMethod,
  });

  if (error) {
    throw new QueryError(error.message, CLIENTS_TABLE, "insertOAuthClient", "global", error);
  }
}

export async function getOAuthClient(
  adminClient: SupabaseClient,
  clientId: string,
): Promise<{
  clientId: string;
  secretHash: string;
  redirectUris: string[];
  grantTypes: string[];
} | null> {
  const { data, error } = await adminClient
    .from(CLIENTS_TABLE)
    .select("client_id, secret_hash, redirect_uris, grant_types")
    .eq("client_id", clientId)
    .eq("is_revoked", false)
    .maybeSingle();

  if (error) {
    throw new QueryError(error.message, CLIENTS_TABLE, "getOAuthClient", "global", error);
  }

  if (!data) return null;

  return {
    clientId: data.client_id,
    secretHash: data.secret_hash,
    redirectUris: data.redirect_uris,
    grantTypes: data.grant_types,
  };
}

// ─── Authorization codes ────────────────────────────────────────

export async function insertOAuthCode(
  adminClient: SupabaseClient,
  data: {
    codeHash: string;
    clientId: string;
    userId: string;
    orgId: string;
    redirectUri: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    scopes: string[];
    expiresAt: string;
  },
): Promise<void> {
  const { error } = await adminClient.from(CODES_TABLE).insert({
    code_hash: data.codeHash,
    client_id: data.clientId,
    user_id: data.userId,
    org_id: data.orgId,
    redirect_uri: data.redirectUri,
    code_challenge: data.codeChallenge,
    code_challenge_method: data.codeChallengeMethod,
    scopes: data.scopes,
    expires_at: data.expiresAt,
  });

  if (error) {
    throw new QueryError(error.message, CODES_TABLE, "insertOAuthCode", data.orgId, error);
  }
}

/**
 * Atomically claim an authorization code.
 * Returns the code row if it was unused and not expired, null otherwise.
 * Uses UPDATE ... WHERE used_at IS NULL to prevent race conditions.
 */
export async function claimOAuthCode(
  adminClient: SupabaseClient,
  codeHash: string,
): Promise<{
  clientId: string;
  userId: string;
  orgId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scopes: string[];
} | null> {
  // Atomic claim: only succeeds if used_at IS NULL and not expired
  const { data, error } = await adminClient
    .from(CODES_TABLE)
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", codeHash)
    .is("used_at", null)
    .gte("expires_at", new Date().toISOString())
    .select("client_id, user_id, org_id, redirect_uri, code_challenge, code_challenge_method, scopes")
    .maybeSingle();

  if (error) {
    throw new QueryError(error.message, CODES_TABLE, "claimOAuthCode", "unknown", error);
  }

  if (!data) return null;

  return {
    clientId: data.client_id,
    userId: data.user_id,
    orgId: data.org_id,
    redirectUri: data.redirect_uri,
    codeChallenge: data.code_challenge,
    codeChallengeMethod: data.code_challenge_method,
    scopes: data.scopes,
  };
}

// ─── Tokens ─────────────────────────────────────────────────────

export async function insertOAuthToken(
  adminClient: SupabaseClient,
  data: {
    accessTokenHash: string;
    refreshTokenHash: string;
    accessTokenPrefix: string;
    clientId: string;
    userId: string;
    orgId: string;
    scopes: string[];
    accessExpiresAt: string;
    refreshExpiresAt: string;
  },
): Promise<string> {
  const { data: row, error } = await adminClient
    .from(TOKENS_TABLE)
    .insert({
      access_token_hash: data.accessTokenHash,
      refresh_token_hash: data.refreshTokenHash,
      access_token_prefix: data.accessTokenPrefix,
      client_id: data.clientId,
      user_id: data.userId,
      org_id: data.orgId,
      scopes: data.scopes,
      access_expires_at: data.accessExpiresAt,
      refresh_expires_at: data.refreshExpiresAt,
    })
    .select("id")
    .single();

  if (error) {
    throw new QueryError(error.message, TOKENS_TABLE, "insertOAuthToken", data.orgId, error);
  }

  return row.id;
}

/**
 * Look up an access token by its hash.
 * Returns identity if valid (not revoked, not expired), null otherwise.
 * Updates last_used_at fire-and-forget.
 */
export async function getTokenByAccessHash(
  adminClient: SupabaseClient,
  accessHash: string,
): Promise<{ userId: string; orgId: string; scopes: string[]; tokenId: string } | null> {
  const { data, error } = await adminClient
    .from(TOKENS_TABLE)
    .select("id, user_id, org_id, scopes, is_revoked, access_expires_at")
    .eq("access_token_hash", accessHash)
    .maybeSingle();

  if (error) {
    throw new QueryError(error.message, TOKENS_TABLE, "getTokenByAccessHash", "unknown", error);
  }

  if (!data) return null;
  if (data.is_revoked) return null;
  if (new Date(data.access_expires_at) < new Date()) return null;

  // Fire-and-forget last_used_at update
  adminClient
    .from(TOKENS_TABLE)
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return { userId: data.user_id, orgId: data.org_id, scopes: data.scopes, tokenId: data.id };
}

/**
 * Look up a refresh token by its hash.
 * Returns identity if valid (not revoked, not expired), null otherwise.
 */
export async function getTokenByRefreshHash(
  adminClient: SupabaseClient,
  refreshHash: string,
): Promise<{
  tokenId: string;
  userId: string;
  orgId: string;
  clientId: string;
  scopes: string[];
} | null> {
  const { data, error } = await adminClient
    .from(TOKENS_TABLE)
    .select("id, user_id, org_id, client_id, scopes, is_revoked, refresh_expires_at")
    .eq("refresh_token_hash", refreshHash)
    .maybeSingle();

  if (error) {
    throw new QueryError(error.message, TOKENS_TABLE, "getTokenByRefreshHash", "unknown", error);
  }

  if (!data) return null;
  if (data.is_revoked) return null;
  if (new Date(data.refresh_expires_at) < new Date()) return null;

  return {
    tokenId: data.id,
    userId: data.user_id,
    orgId: data.org_id,
    clientId: data.client_id,
    scopes: data.scopes,
  };
}

export async function revokeOAuthToken(
  adminClient: SupabaseClient,
  tokenId: string,
): Promise<void> {
  const { error } = await adminClient
    .from(TOKENS_TABLE)
    .update({ is_revoked: true })
    .eq("id", tokenId);

  if (error) {
    throw new QueryError(error.message, TOKENS_TABLE, "revokeOAuthToken", "unknown", error);
  }
}

export async function revokeAllOAuthTokens(
  adminClient: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<void> {
  const { error } = await adminClient
    .from(TOKENS_TABLE)
    .update({ is_revoked: true })
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .eq("is_revoked", false);

  if (error) {
    throw new QueryError(error.message, TOKENS_TABLE, "revokeAllOAuthTokens", orgId, error);
  }
}

export async function listOAuthTokensForOrg(
  ctx: OrgContext,
): Promise<OAuthTokenRow[]> {
  const { data, error } = await ctx.client
    .from(TOKENS_TABLE)
    .select(
      "id, access_token_prefix, client_id, user_id, org_id, scopes, access_expires_at, refresh_expires_at, is_revoked, last_used_at, created_at",
    )
    .eq("org_id", ctx.orgId)
    .eq("is_revoked", false)
    .order("created_at", { ascending: false });

  if (error) {
    throw new QueryError(error.message, TOKENS_TABLE, "listOAuthTokensForOrg", ctx.orgId, error);
  }

  return (data ?? []) as OAuthTokenRow[];
}
