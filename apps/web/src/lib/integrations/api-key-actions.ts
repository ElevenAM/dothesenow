"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createOrgApiKey,
  getOrgApiKeys,
  revokeApiKey as revokeApiKeyQuery,
  type OrgApiKey,
} from "@dothesenow/queries";

const SETTINGS_PATH = "/settings/integrations/claude-plugin";

/**
 * Generate a new MCP API key for the org.
 * Requires admin or owner role.
 * Returns the full key — must be shown to user exactly once.
 */
export async function generateApiKey(
  label: string,
): Promise<{ key: string; apiKey: OrgApiKey }> {
  try {
    const { auth, ctx } = await getAuthenticatedOrgContext(["admin", "owner"]);

    const adminClient = createAdminClient();
    const result = await createOrgApiKey(adminClient, ctx.orgId, {
      label: label || "Default",
      createdBy: auth.user.id,
    });

    revalidatePath(SETTINGS_PATH);
    return result;
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to generate API key",
    );
  }
}

/**
 * List all active API keys for the org.
 */
export async function listApiKeys(): Promise<OrgApiKey[]> {
  try {
    const { ctx } = await getAuthenticatedOrgContext();
    return await getOrgApiKeys(ctx);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to list API keys",
    );
  }
}

/**
 * Revoke an API key. Requires admin or owner role.
 */
export async function revokeApiKeyAction(keyId: string): Promise<void> {
  try {
    const { ctx } = await getAuthenticatedOrgContext(["admin", "owner"]);

    const adminClient = createAdminClient();
    await revokeApiKeyQuery(adminClient, ctx.orgId, keyId);

    revalidatePath(SETTINGS_PATH);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to revoke API key",
    );
  }
}
