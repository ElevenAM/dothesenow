import type { SupabaseClient } from "@supabase/supabase-js";
import {
  upsertOrgIntegration,
  storeIntegrationSecret,
} from "@dothesenow/queries";

// ─── Types ──────────────────────────────────────────────────

interface SlackOAuthV2Response {
  ok: boolean;
  error?: string;
  access_token: string;
  token_type: "bot";
  scope: string;
  bot_user_id: string;
  app_id: string;
  team: { id: string; name: string };
  authed_user: { id: string };
}

// ─── OAuth URL construction ─────────────────────────────────

const SLACK_OAUTH_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access";

const BOT_SCOPES = [
  "app_mentions:read",
  "chat:write",
  "commands",
  "users:read",
  "users:read.email",
].join(",");

/**
 * Build the Slack OAuth v2 authorize URL.
 * @param state - CSRF token to verify on callback
 */
export function buildAuthorizeUrl(state: string): string {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) throw new Error("SLACK_CLIENT_ID not configured");

  const redirectUri = getRedirectUri();

  const params = new URLSearchParams({
    client_id: clientId,
    scope: BOT_SCOPES,
    redirect_uri: redirectUri,
    state,
  });

  return `${SLACK_OAUTH_URL}?${params.toString()}`;
}

// ─── Token exchange ─────────────────────────────────────────

/**
 * Exchange an OAuth authorization code for a bot token.
 */
export async function exchangeCodeForToken(
  code: string,
): Promise<SlackOAuthV2Response> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("SLACK_CLIENT_ID and SLACK_CLIENT_SECRET must be configured");
  }

  const res = await fetch(SLACK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: getRedirectUri(),
    }),
  });

  const data = (await res.json()) as SlackOAuthV2Response;

  if (!data.ok) {
    throw new Error(`Slack OAuth error: ${data.error ?? "unknown"}`);
  }

  return data;
}

// ─── Installation persistence ───────────────────────────────

/**
 * Save a Slack installation to the database:
 * 1. Store bot token in Vault
 * 2. Create dtn_slack_installations record
 * 3. Upsert dtn_org_integrations with integration_type='slack'
 */
export async function saveSlackInstallation(
  adminClient: SupabaseClient,
  orgId: string,
  tokenResponse: SlackOAuthV2Response,
  installerUserId: string,
): Promise<void> {
  // 1. Store bot token in Vault
  const vaultSecretId = await storeIntegrationSecret(
    adminClient,
    `dtn_slack_bot_${orgId}_${tokenResponse.team.id}`,
    tokenResponse.access_token,
  );

  // 2. Upsert slack installation record
  const { error: installError } = await adminClient
    .from("dtn_slack_installations")
    .upsert(
      {
        org_id: orgId,
        team_id: tokenResponse.team.id,
        team_name: tokenResponse.team.name,
        bot_user_id: tokenResponse.bot_user_id,
        app_id: tokenResponse.app_id,
        installer_user_id: installerUserId,
        bot_scopes: tokenResponse.scope.split(","),
        user_cache: {},
      },
      { onConflict: "org_id,team_id" },
    );

  if (installError) {
    throw new Error(`Failed to save Slack installation: ${installError.message}`);
  }

  // 3. Upsert org integration
  await upsertOrgIntegration(adminClient, orgId, {
    integration_type: "slack",
    config: {
      team_id: tokenResponse.team.id,
      team_name: tokenResponse.team.name,
    },
    vault_secret_id: vaultSecretId,
    connected_by: installerUserId,
  });
}

// ─── Helpers ────────────────────────────────────────────────

function getRedirectUri(): string {
  // Use a stable redirect URI that matches what's registered in the Slack app manifest.
  // NEXT_PUBLIC_APP_URL should be set to the production domain (e.g., https://dothesenow.com).
  // Never derive from VERCEL_URL — that changes per deployment and will cause redirect_uri_mismatch.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must be set (e.g., https://dothesenow.com). " +
      "This ensures the OAuth redirect URI matches the Slack app manifest.",
    );
  }

  return `${appUrl}/api/slack/oauth`;
}
