import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hashToken,
  generateAccessToken,
  generateRefreshToken,
  insertOAuthToken,
  getTokenByAccessHash,
  getTokenByRefreshHash,
  revokeOAuthToken,
  ACCESS_PREFIX,
} from "@dothesenow/queries";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS } from "./config";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

/**
 * Generate a new access + refresh token pair and store their hashes.
 */
export async function generateTokenPair(
  adminClient: SupabaseClient,
  params: {
    clientId: string;
    userId: string;
    orgId: string;
    scopes: string[];
  },
): Promise<TokenPair> {
  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();

  const accessHash = hashToken(accessToken);
  const refreshHash = hashToken(refreshToken);
  const accessPrefix = accessToken.slice(0, 12) + "...";

  const now = Date.now();
  const accessExpiresAt = new Date(
    now + ACCESS_TOKEN_TTL_SECONDS * 1000,
  ).toISOString();
  const refreshExpiresAt = new Date(
    now + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  await insertOAuthToken(adminClient, {
    accessTokenHash: accessHash,
    refreshTokenHash: refreshHash,
    accessTokenPrefix: accessPrefix,
    clientId: params.clientId,
    userId: params.userId,
    orgId: params.orgId,
    scopes: params.scopes,
    accessExpiresAt,
    refreshExpiresAt,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    scope: params.scopes.join(" "),
  };
}

/**
 * Validate an access token.
 * Returns identity if valid, null otherwise.
 */
export async function validateAccessToken(
  adminClient: SupabaseClient,
  rawToken: string,
): Promise<{ orgId: string; tokenId: string } | null> {
  if (!rawToken.startsWith(ACCESS_PREFIX) || rawToken.length > 64) return null;

  const hash = hashToken(rawToken);
  const result = await getTokenByAccessHash(adminClient, hash);

  if (!result) return null;

  return { orgId: result.orgId, tokenId: result.tokenId };
}

/**
 * Refresh an access token.
 * Revokes the old token row and creates a new pair (full rotation).
 *
 * Client secret validation is handled by the route handler before calling this.
 */
export async function refreshAccessToken(
  adminClient: SupabaseClient,
  params: {
    refreshToken: string;
    clientId: string;
  },
): Promise<TokenPair> {
  const refreshHash = hashToken(params.refreshToken);
  const existing = await getTokenByRefreshHash(adminClient, refreshHash);

  if (!existing) {
    throw new Error("Invalid or expired refresh token");
  }

  if (existing.clientId !== params.clientId) {
    throw new Error("client_id mismatch on refresh");
  }

  // Revoke the old token (both access and refresh become invalid)
  await revokeOAuthToken(adminClient, existing.tokenId);

  // Issue a completely new pair
  return generateTokenPair(adminClient, {
    clientId: existing.clientId,
    userId: existing.userId,
    orgId: existing.orgId,
    scopes: existing.scopes,
  });
}
