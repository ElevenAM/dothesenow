import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgContext } from "./context.js";
import { QueryError } from "./errors.js";
import { storeIntegrationSecret, deleteIntegrationSecret } from "./integrations.js";

const TABLE = "dtn_org_api_keys";
const KEY_PREFIX = "dtn_mcp_";

// ─── Types ──────────────────────────────────────────────────────

export interface OrgApiKey {
  id: string;
  org_id: string;
  key_prefix: string;
  label: string;
  scopes: string[];
  created_by: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ValidatedApiKey {
  orgId: string;
  keyId: string;
}

// ─── Helpers ────────────────────────────────────────────────────

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRawKey(): string {
  // dtn_mcp_ + 32 random hex chars = 40 char key
  return KEY_PREFIX + randomBytes(16).toString("hex");
}

// ─── Read queries (OrgContext — respects RLS) ───────────────────

/**
 * List all active API keys for an org.
 * Returns metadata only — never the full key.
 */
export async function getOrgApiKeys(ctx: OrgContext): Promise<OrgApiKey[]> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select(
      "id, org_id, key_prefix, label, scopes, created_by, last_used_at, expires_at, is_active, created_at, updated_at",
    )
    .eq("org_id", ctx.orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw new QueryError(error.message, TABLE, "getOrgApiKeys", ctx.orgId, error);
  }

  return (data ?? []) as OrgApiKey[];
}

// ─── Write queries (admin client — bypasses RLS) ────────────────

/**
 * Generate a new API key for an org.
 * Stores the full key in Vault, inserts a row with the hash.
 * Returns the full key — show to user exactly once.
 */
export async function createOrgApiKey(
  adminClient: SupabaseClient,
  orgId: string,
  input: { label: string; createdBy: string },
): Promise<{ key: string; apiKey: OrgApiKey }> {
  const rawKey = generateRawKey();
  const hash = hashKey(rawKey);
  const prefix = rawKey.slice(0, 12) + "...";

  // Store full key in Vault
  const vaultSecretId = await storeIntegrationSecret(
    adminClient,
    `dtn_api_key_${orgId}_${hash.slice(0, 8)}`,
    rawKey,
  );

  const { data, error } = await adminClient
    .from(TABLE)
    .insert({
      org_id: orgId,
      key_prefix: prefix,
      key_hash: hash,
      vault_secret_id: vaultSecretId,
      label: input.label,
      created_by: input.createdBy,
    })
    .select()
    .single();

  if (error) {
    throw new QueryError(error.message, TABLE, "createOrgApiKey", orgId, error);
  }

  return { key: rawKey, apiKey: data as OrgApiKey };
}

/**
 * Validate an API key by hashing and looking up.
 * Returns org/key IDs if valid, null if invalid/revoked/expired.
 * Updates last_used_at on success.
 */
export async function validateApiKey(
  adminClient: SupabaseClient,
  rawKey: string,
): Promise<ValidatedApiKey | null> {
  if (!rawKey.startsWith(KEY_PREFIX)) return null;

  const hash = hashKey(rawKey);

  const { data, error } = await adminClient
    .from(TABLE)
    .select("id, org_id, is_active, expires_at")
    .eq("key_hash", hash)
    .maybeSingle();

  if (error || !data) return null;
  if (!data.is_active) return null;

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return null;
  }

  // Update last_used_at (fire and forget — don't block the request)
  adminClient
    .from(TABLE)
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return { orgId: data.org_id, keyId: data.id };
}

/**
 * Revoke an API key. Sets is_active=false and deletes the Vault secret.
 * Always scoped by org_id for tenant safety.
 */
export async function revokeApiKey(
  adminClient: SupabaseClient,
  orgId: string,
  keyId: string,
): Promise<void> {
  // Fetch the key row (scoped to org for safety)
  const { data, error: fetchError } = await adminClient
    .from(TABLE)
    .select("id, vault_secret_id")
    .eq("id", keyId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (fetchError) {
    throw new QueryError(fetchError.message, TABLE, "revokeApiKey", orgId, fetchError);
  }

  if (!data) {
    throw new QueryError("API key not found or not owned by this org", TABLE, "revokeApiKey", orgId);
  }

  // Delete Vault secret
  if (data.vault_secret_id) {
    await deleteIntegrationSecret(adminClient, data.vault_secret_id);
  }

  // Deactivate the key
  const { error: updateError } = await adminClient
    .from(TABLE)
    .update({ is_active: false })
    .eq("id", keyId)
    .eq("org_id", orgId);

  if (updateError) {
    throw new QueryError(updateError.message, TABLE, "revokeApiKey", orgId, updateError);
  }
}
