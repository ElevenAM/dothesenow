"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getOrgIntegration,
  upsertOrgIntegration,
  deactivateOrgIntegration,
  storeIntegrationSecret,
  deleteIntegrationSecret,
  getMembershipsForOrg,
} from "@dothesenow/queries";
import { getExecutor } from "@/lib/executors/registry";
import { buildAuthorizeUrl } from "@/lib/slack/oauth";
import { buildAuthorizeUrl as buildHubSpotAuthorizeUrl } from "@/lib/hubspot/oauth";

/**
 * Connect an integration by storing its config and secrets.
 * Requires admin or owner role.
 */
export async function connectIntegration(
  executorType: string,
  config: Record<string, string>,
): Promise<void> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  // Verify admin/owner role
  const memberships = await getMembershipsForOrg(ctx);
  const currentMembership = memberships.find(
    (m) => m.user_id === auth.user.id,
  );
  if (!currentMembership || !["owner", "admin"].includes(currentMembership.role)) {
    throw new Error("Only admins and owners can manage integrations");
  }

  const executor = getExecutor(executorType);
  if (!executor) {
    throw new Error(`Unknown executor type: ${executorType}`);
  }

  const adminClient = createAdminClient();

  // Separate secret fields from non-secret fields
  const secretFields = executor.configSchema.filter((f) => f.type === "secret");
  const nonSecretFields = executor.configSchema.filter((f) => f.type !== "secret");

  // Build non-secret config
  const nonSecretConfig: Record<string, string> = {};
  for (const field of nonSecretFields) {
    if (config[field.key]) {
      nonSecretConfig[field.key] = config[field.key];
    }
  }

  // Test connection BEFORE deleting old secret — if the new key is invalid,
  // we must not destroy the existing working credentials.
  if (executor.testConnection) {
    const secretValue = secretFields.length > 0 ? config[secretFields[0].key] : "";
    await executor.testConnection(secretValue, nonSecretConfig);
  }

  // Delete old Vault secret (safe now — testConnection passed)
  const existing = await getOrgIntegration(ctx, executorType);
  if (existing?.vault_secret_id) {
    await deleteIntegrationSecret(adminClient, existing.vault_secret_id);
  }

  // Store new secret in Vault (use first secret field — typically api_key)
  let vaultSecretId: string | null = null;
  if (secretFields.length > 0) {
    const secretKey = secretFields[0].key;
    const secretValue = config[secretKey];
    if (secretValue) {
      vaultSecretId = await storeIntegrationSecret(
        adminClient,
        `dtn_integration_${ctx.orgId}_${executorType}`,
        secretValue,
      );
    }
  }

  // Upsert the integration
  await upsertOrgIntegration(adminClient, ctx.orgId, {
    integration_type: executorType,
    config: nonSecretConfig,
    vault_secret_id: vaultSecretId,
    connected_by: auth.user.id,
  });

  revalidatePath("/settings/integrations");
}

/**
 * Disconnect an integration by deactivating it and cleaning up Vault secrets.
 * Requires admin or owner role.
 */
export async function disconnectIntegration(
  executorType: string,
): Promise<void> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  // Verify admin/owner role
  const memberships = await getMembershipsForOrg(ctx);
  const currentMembership = memberships.find(
    (m) => m.user_id === auth.user.id,
  );
  if (!currentMembership || !["owner", "admin"].includes(currentMembership.role)) {
    throw new Error("Only admins and owners can manage integrations");
  }

  const adminClient = createAdminClient();

  // Load existing integration to get vault_secret_id
  const existing = await getOrgIntegration(ctx, executorType);
  if (!existing) return; // Already disconnected

  // Delete Vault secret
  if (existing.vault_secret_id) {
    await deleteIntegrationSecret(adminClient, existing.vault_secret_id);
  }

  // Deactivate the integration
  await deactivateOrgIntegration(adminClient, ctx.orgId, executorType);

  revalidatePath("/settings/integrations");
}

// ─── Slack-specific actions ─────────────────────────────────

const SLACK_STATE_COOKIE = "dtn_slack_oauth_state";

/**
 * Initiate Slack OAuth flow.
 * Sets a CSRF state cookie and redirects to Slack's authorize URL.
 */
export async function initiateSlackOAuth(): Promise<void> {
  const { auth } = await getAuthenticatedOrgContext();

  const state = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(SLACK_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  const authorizeUrl = buildAuthorizeUrl(state);
  redirect(authorizeUrl);
}

// ─── HubSpot-specific actions ──────────────────────────────

const HUBSPOT_STATE_COOKIE = "dtn_hubspot_oauth_state";

/**
 * Initiate HubSpot OAuth flow.
 * Sets a CSRF state cookie and redirects to HubSpot's authorize URL.
 */
export async function initiateHubSpotOAuth(): Promise<void> {
  const { auth } = await getAuthenticatedOrgContext();

  const state = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(HUBSPOT_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const authorizeUrl = buildHubSpotAuthorizeUrl(state);
  redirect(authorizeUrl);
}

/**
 * Disconnect HubSpot integration.
 * Cleans up: Vault secret, dtn_org_integrations, dtn_hubspot_field_mappings.
 */
export async function disconnectHubSpot(): Promise<void> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  // Verify admin/owner role
  const memberships = await getMembershipsForOrg(ctx);
  const currentMembership = memberships.find(
    (m) => m.user_id === auth.user.id,
  );
  if (!currentMembership || !["owner", "admin"].includes(currentMembership.role)) {
    throw new Error("Only admins and owners can manage integrations");
  }

  const adminClient = createAdminClient();

  // Delete Vault secret + deactivate org integration
  const existing = await getOrgIntegration(ctx, "hubspot");
  if (existing) {
    if (existing.vault_secret_id) {
      await deleteIntegrationSecret(adminClient, existing.vault_secret_id);
    }
    await deactivateOrgIntegration(adminClient, ctx.orgId, "hubspot");
  }

  // Clean up field mappings
  await adminClient
    .from("dtn_hubspot_field_mappings")
    .delete()
    .eq("org_id", ctx.orgId);

  revalidatePath("/settings/integrations");
}

/**
 * Disconnect Slack integration.
 * Cleans up: dtn_slack_installations, Vault secret, dtn_org_integrations.
 */
export async function disconnectSlack(): Promise<void> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  // Verify admin/owner role
  const memberships = await getMembershipsForOrg(ctx);
  const currentMembership = memberships.find(
    (m) => m.user_id === auth.user.id,
  );
  if (!currentMembership || !["owner", "admin"].includes(currentMembership.role)) {
    throw new Error("Only admins and owners can manage integrations");
  }

  const adminClient = createAdminClient();

  // Delete slack installation record
  await adminClient
    .from("dtn_slack_installations")
    .delete()
    .eq("org_id", ctx.orgId);

  // Delete Vault secret + deactivate org integration
  const existing = await getOrgIntegration(ctx, "slack");
  if (existing) {
    if (existing.vault_secret_id) {
      await deleteIntegrationSecret(adminClient, existing.vault_secret_id);
    }
    await deactivateOrgIntegration(adminClient, ctx.orgId, "slack");
  }

  revalidatePath("/settings/integrations");
}
