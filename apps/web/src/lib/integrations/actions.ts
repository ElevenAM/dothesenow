"use server";

import { revalidatePath } from "next/cache";
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
