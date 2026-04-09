import type { SupabaseClient } from "@supabase/supabase-js";
import {
  upsertOrgIntegration,
  storeIntegrationSecret,
} from "@dothesenow/queries";
import {
  type OAuthProviderConfig,
  buildOAuthAuthorizeUrl,
  exchangeOAuthCode,
  type OAuthTokenResponse,
} from "@/lib/integrations/oauth-base";

function getConfig(): OAuthProviderConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured");
  }

  return {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId,
    clientSecret,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    redirectPath: "/api/google-analytics/oauth",
    hasRefreshToken: true,
  };
}

export function buildAuthorizeUrl(state: string): string {
  // Google requires access_type=offline to get a refresh token
  const baseUrl = buildOAuthAuthorizeUrl(getConfig(), state);
  return `${baseUrl}&access_type=offline&prompt=consent`;
}

export async function exchangeCodeForToken(
  code: string,
): Promise<OAuthTokenResponse> {
  return exchangeOAuthCode(getConfig(), code);
}

export function getGAOAuthConfig(): OAuthProviderConfig {
  return getConfig();
}

/**
 * Save GA4 installation:
 * 1. Store refresh token in Vault
 * 2. Upsert dtn_org_integrations with access token in config
 */
export async function saveGAInstallation(
  adminClient: SupabaseClient,
  orgId: string,
  tokenResponse: OAuthTokenResponse,
  installerUserId: string,
  propertyId?: string,
): Promise<void> {
  // Store refresh token in Vault
  const vaultSecretId = await storeIntegrationSecret(
    adminClient,
    `dtn_ga_refresh_${orgId}`,
    tokenResponse.refresh_token ?? "",
  );

  const expiresAt = tokenResponse.expires_in
    ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
    : null;

  await upsertOrgIntegration(adminClient, orgId, {
    integration_type: "google_analytics",
    config: {
      access_token: tokenResponse.access_token,
      token_expires_at: expiresAt,
      property_id: propertyId ?? null,
    },
    vault_secret_id: vaultSecretId,
    connected_by: installerUserId,
  });
}
