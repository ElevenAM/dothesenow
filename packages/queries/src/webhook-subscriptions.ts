import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgContext } from "./context.js";
import type {
  WebhookSubscription,
  CreateWebhookSubscriptionInput,
} from "@dothesenow/types";
import { QueryError } from "./errors.js";
import { storeIntegrationSecret, deleteIntegrationSecret } from "./integrations.js";
import { randomBytes } from "crypto";

const TABLE = "dtn_webhook_subscriptions";
const MAX_SUBS_PER_EVENT = 10;

// ─── Write queries (admin client) ───────────────────────────

/**
 * Create a webhook subscription. Generates an HMAC signing secret,
 * stores it in Vault, and returns the secret once (like API key creation).
 * Enforces a limit of 10 active subscriptions per org per event type.
 */
export async function createWebhookSubscription(
  adminClient: SupabaseClient,
  orgId: string,
  userId: string,
  input: CreateWebhookSubscriptionInput,
): Promise<{ subscription: WebhookSubscription; signingSecret: string }> {
  // Check subscription limit per org per event type
  const { count, error: countError } = await adminClient
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("event_type", input.event_type)
    .eq("is_active", true);

  if (countError) {
    throw new QueryError(countError.message, TABLE, "createWebhookSubscription", orgId, countError);
  }

  if ((count ?? 0) >= MAX_SUBS_PER_EVENT) {
    throw new QueryError(
      `Maximum ${MAX_SUBS_PER_EVENT} active subscriptions per event type`,
      TABLE,
      "createWebhookSubscription",
      orgId,
    );
  }

  // Generate signing secret
  const signingSecret = `whsec_${randomBytes(32).toString("hex")}`;

  // Store in Vault
  const vaultSecretId = await storeIntegrationSecret(
    adminClient,
    `dtn_webhook_${orgId}_${randomBytes(4).toString("hex")}`,
    signingSecret,
  );

  const { data, error } = await adminClient
    .from(TABLE)
    .insert({
      org_id: orgId,
      event_type: input.event_type,
      target_url: input.target_url,
      vault_secret_id: vaultSecretId,
      created_by: userId,
    })
    .select("*")
    .single();

  if (error) {
    throw new QueryError(error.message, TABLE, "createWebhookSubscription", orgId, error);
  }

  return {
    subscription: data as WebhookSubscription,
    signingSecret,
  };
}

export async function getActiveSubscriptionsForEvent(
  adminClient: SupabaseClient,
  orgId: string,
  eventType: string,
): Promise<WebhookSubscription[]> {
  const { data, error } = await adminClient
    .from(TABLE)
    .select("*")
    .eq("org_id", orgId)
    .eq("event_type", eventType)
    .eq("is_active", true);

  if (error) {
    throw new QueryError(error.message, TABLE, "getActiveSubscriptionsForEvent", orgId, error);
  }

  return (data ?? []) as WebhookSubscription[];
}

// ─── Read queries ───────────────────────────────────────────

export async function listWebhookSubscriptions(
  ctx: OrgContext,
): Promise<WebhookSubscription[]> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new QueryError(error.message, TABLE, "listWebhookSubscriptions", ctx.orgId, error);
  }

  return (data ?? []) as WebhookSubscription[];
}

// ─── Mutation helpers ──────────────────────────────────────

export async function deleteWebhookSubscription(
  adminClient: SupabaseClient,
  orgId: string,
  subscriptionId: string,
): Promise<void> {
  // Load to get vault_secret_id
  const { data: sub, error: loadError } = await adminClient
    .from(TABLE)
    .select("vault_secret_id")
    .eq("id", subscriptionId)
    .eq("org_id", orgId)
    .single();

  if (loadError) {
    throw new QueryError(loadError.message, TABLE, "deleteWebhookSubscription", orgId, loadError);
  }

  // Delete Vault secret
  if (sub?.vault_secret_id) {
    await deleteIntegrationSecret(adminClient, sub.vault_secret_id);
  }

  // Deactivate (soft delete)
  const { error } = await adminClient
    .from(TABLE)
    .update({ is_active: false })
    .eq("id", subscriptionId)
    .eq("org_id", orgId);

  if (error) {
    throw new QueryError(error.message, TABLE, "deleteWebhookSubscription", orgId, error);
  }
}

export async function incrementWebhookFailureCount(
  adminClient: SupabaseClient,
  subscriptionId: string,
): Promise<number> {
  // Fetch current count, increment, update
  const { data, error: fetchError } = await adminClient
    .from(TABLE)
    .select("failure_count")
    .eq("id", subscriptionId)
    .single();

  if (fetchError) {
    throw new QueryError(fetchError.message, TABLE, "incrementWebhookFailureCount", "", fetchError);
  }

  const newCount = (data?.failure_count ?? 0) + 1;

  const { error } = await adminClient
    .from(TABLE)
    .update({
      failure_count: newCount,
      last_failure_at: new Date().toISOString(),
    })
    .eq("id", subscriptionId);

  if (error) {
    throw new QueryError(error.message, TABLE, "incrementWebhookFailureCount", "", error);
  }

  return newCount;
}

export async function resetWebhookFailureCount(
  adminClient: SupabaseClient,
  subscriptionId: string,
): Promise<void> {
  const { error } = await adminClient
    .from(TABLE)
    .update({
      failure_count: 0,
      last_failure_at: null,
      last_triggered_at: new Date().toISOString(),
    })
    .eq("id", subscriptionId);

  if (error) {
    throw new QueryError(error.message, TABLE, "resetWebhookFailureCount", "", error);
  }
}

export async function deactivateWebhookSubscription(
  adminClient: SupabaseClient,
  subscriptionId: string,
): Promise<void> {
  const { error } = await adminClient
    .from(TABLE)
    .update({ is_active: false })
    .eq("id", subscriptionId);

  if (error) {
    throw new QueryError(error.message, TABLE, "deactivateWebhookSubscription", "", error);
  }
}
