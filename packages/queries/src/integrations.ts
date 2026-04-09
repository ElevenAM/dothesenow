import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgContext } from "./context.js";
import type { OrgIntegration } from "@dothesenow/types";
import { QueryError } from "./errors.js";

const TABLE = "dtn_org_integrations";

// ─── Read queries (OrgContext — respects RLS) ────────────────

/**
 * Get all active integrations for an org.
 */
export async function getOrgIntegrations(
  ctx: OrgContext,
): Promise<OrgIntegration[]> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("is_active", true)
    .order("integration_type");

  if (error) {
    throw new QueryError(error.message, TABLE, "getOrgIntegrations", ctx.orgId, error);
  }

  return (data ?? []) as OrgIntegration[];
}

/**
 * Get a single integration by type.
 */
export async function getOrgIntegration(
  ctx: OrgContext,
  integrationType: string,
): Promise<OrgIntegration | null> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("integration_type", integrationType)
    .maybeSingle();

  if (error) {
    throw new QueryError(error.message, TABLE, "getOrgIntegration", ctx.orgId, error);
  }

  return (data as OrgIntegration) ?? null;
}

// ─── Write queries (admin client — bypasses RLS) ─────────────

export interface UpsertIntegrationInput {
  integration_type: string;
  config?: Record<string, unknown>;
  vault_secret_id?: string | null;
  connected_by: string;
}

/**
 * Insert or update an integration for an org.
 * Uses admin client because RLS only allows SELECT for authenticated users.
 */
export async function upsertOrgIntegration(
  adminClient: SupabaseClient,
  orgId: string,
  input: UpsertIntegrationInput,
): Promise<OrgIntegration> {
  const { data, error } = await adminClient
    .from(TABLE)
    .upsert(
      {
        org_id: orgId,
        integration_type: input.integration_type,
        config: input.config ?? {},
        vault_secret_id: input.vault_secret_id ?? null,
        is_active: true,
        connected_at: new Date().toISOString(),
        connected_by: input.connected_by,
        last_error: null,
      },
      { onConflict: "org_id,integration_type" },
    )
    .select()
    .single();

  if (error) {
    throw new QueryError(error.message, TABLE, "upsertOrgIntegration", orgId, error);
  }

  return data as OrgIntegration;
}

/**
 * Deactivate an integration (set is_active = false).
 */
export async function deactivateOrgIntegration(
  adminClient: SupabaseClient,
  orgId: string,
  integrationType: string,
): Promise<void> {
  const { error } = await adminClient
    .from(TABLE)
    .update({ is_active: false })
    .eq("org_id", orgId)
    .eq("integration_type", integrationType);

  if (error) {
    throw new QueryError(error.message, TABLE, "deactivateOrgIntegration", orgId, error);
  }
}

/**
 * Update last_used_at and optionally last_error after a dispatch attempt.
 */
export async function updateIntegrationLastUsed(
  adminClient: SupabaseClient,
  orgId: string,
  integrationType: string,
  lastError?: string,
): Promise<void> {
  const { error } = await adminClient
    .from(TABLE)
    .update({
      last_used_at: new Date().toISOString(),
      last_error: lastError ?? null,
    })
    .eq("org_id", orgId)
    .eq("integration_type", integrationType);

  if (error) {
    throw new QueryError(error.message, TABLE, "updateIntegrationLastUsed", orgId, error);
  }
}

// ─── Vault helpers (admin client required) ───────────────────

/**
 * Read a decrypted secret from Supabase Vault.
 */
export async function getIntegrationSecret(
  adminClient: SupabaseClient,
  vaultSecretId: string,
): Promise<string> {
  const { data, error } = await adminClient.rpc("dtn_vault_read_secret", {
    p_secret_id: vaultSecretId,
  });

  if (error) {
    throw new QueryError(
      error.message,
      "vault.decrypted_secrets",
      "getIntegrationSecret",
      "vault",
      error,
    );
  }

  if (!data) {
    throw new QueryError(
      "Secret not found in Vault",
      "vault.decrypted_secrets",
      "getIntegrationSecret",
      "vault",
    );
  }

  return data as string;
}

/**
 * Store a secret in Supabase Vault.
 * @returns the UUID of the stored secret
 */
export async function storeIntegrationSecret(
  adminClient: SupabaseClient,
  name: string,
  value: string,
): Promise<string> {
  const { data, error } = await adminClient.rpc("dtn_vault_create_secret", {
    p_secret: value,
    p_name: name,
  });

  if (error) {
    throw new QueryError(
      error.message,
      "vault.secrets",
      "storeIntegrationSecret",
      "vault",
      error,
    );
  }

  return data as string;
}

/**
 * Delete a secret from Supabase Vault.
 */
export async function deleteIntegrationSecret(
  adminClient: SupabaseClient,
  vaultSecretId: string,
): Promise<void> {
  const { error } = await adminClient.rpc("dtn_vault_delete_secret", {
    p_secret_id: vaultSecretId,
  });

  if (error) {
    throw new QueryError(
      error.message,
      "vault.secrets",
      "deleteIntegrationSecret",
      "vault",
      error,
    );
  }
}
