import type { SupabaseClient } from "@supabase/supabase-js";
import {
  upsertOrgIntegration,
  storeIntegrationSecret,
  seedDefaultMappings,
} from "@dothesenow/queries";
import {
  type OAuthProviderConfig,
  buildOAuthAuthorizeUrl,
  exchangeOAuthCode,
  type OAuthTokenResponse,
} from "@/lib/integrations/oauth-base";

// ─── HubSpot OAuth config ──────────────────────────────────

function getConfig(): OAuthProviderConfig {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET must be configured");
  }

  return {
    authUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    clientId,
    clientSecret,
    scopes: [
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "crm.schemas.contacts.read",
      "oauth",
    ],
    redirectPath: "/api/hubspot/oauth",
    hasRefreshToken: true,
  };
}

// ─── Public API ────────────────────────────────────────────

export function buildAuthorizeUrl(state: string): string {
  return buildOAuthAuthorizeUrl(getConfig(), state);
}

export async function exchangeCodeForToken(
  code: string,
): Promise<OAuthTokenResponse> {
  return exchangeOAuthCode(getConfig(), code);
}

/**
 * Save HubSpot installation:
 * 1. Store refresh token in Vault (sensitive, rarely changes)
 * 2. Upsert dtn_org_integrations with access token in config (short-lived, frequently updated)
 * 3. Seed default field mappings
 */
export async function saveHubSpotInstallation(
  adminClient: SupabaseClient,
  orgId: string,
  tokenResponse: OAuthTokenResponse,
  installerUserId: string,
): Promise<void> {
  const hubId = tokenResponse.raw.hub_id ?? tokenResponse.raw.hub_domain ?? "unknown";

  // 1. Store refresh token in Vault
  const vaultSecretId = await storeIntegrationSecret(
    adminClient,
    `dtn_hubspot_refresh_${orgId}`,
    tokenResponse.refresh_token ?? "",
  );

  // 2. Upsert org integration with access token in config
  const expiresAt = tokenResponse.expires_in
    ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
    : null;

  await upsertOrgIntegration(adminClient, orgId, {
    integration_type: "hubspot",
    config: {
      hub_id: String(hubId),
      access_token: tokenResponse.access_token,
      token_expires_at: expiresAt,
    },
    vault_secret_id: vaultSecretId,
    connected_by: installerUserId,
  });

  // 3. Seed default field mappings
  await seedDefaultMappings(adminClient, orgId);
}
