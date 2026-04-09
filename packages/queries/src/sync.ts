import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgContext } from "./context.js";
import type {
  SyncLog,
  CreateSyncLogInput,
  UpdateSyncLogInput,
} from "@dothesenow/types";
import { QueryError } from "./errors.js";

const TABLE = "dtn_sync_log";

// ─── Write queries (admin client) ───────────────────────────

export async function createSyncLog(
  adminClient: SupabaseClient,
  orgId: string,
  input: CreateSyncLogInput,
): Promise<SyncLog> {
  const { data, error } = await adminClient
    .from(TABLE)
    .insert({
      org_id: orgId,
      integration_type: input.integration_type,
      sync_type: input.sync_type,
      direction: input.direction ?? "bidirectional",
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new QueryError(error.message, TABLE, "createSyncLog", orgId, error);
  }

  return data as SyncLog;
}

export async function updateSyncLog(
  adminClient: SupabaseClient,
  syncLogId: string,
  updates: UpdateSyncLogInput,
): Promise<void> {
  const { error } = await adminClient
    .from(TABLE)
    .update(updates)
    .eq("id", syncLogId);

  if (error) {
    throw new QueryError(error.message, TABLE, "updateSyncLog", "", error);
  }
}

// ─── Read queries ───────────────────────────────────────────

export async function getRecentSyncLogs(
  ctx: OrgContext,
  integrationType: string,
  limit = 10,
): Promise<SyncLog[]> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("integration_type", integrationType)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new QueryError(error.message, TABLE, "getRecentSyncLogs", ctx.orgId, error);
  }

  return (data ?? []) as SyncLog[];
}

export async function getLatestSyncLog(
  ctx: OrgContext,
  integrationType: string,
): Promise<SyncLog | null> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("integration_type", integrationType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new QueryError(error.message, TABLE, "getLatestSyncLog", ctx.orgId, error);
  }

  return (data as SyncLog) ?? null;
}
