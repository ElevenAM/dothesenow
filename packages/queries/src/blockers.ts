import type { OrgContext } from "./context.js";
import type {
  Blocker,
  ReportBlockerInput,
  BlockerResolutionStatus,
} from "@dothesenow/types";
import { QueryError } from "./errors.js";

const TABLE = "dtn_blockers";

export async function createBlocker(
  ctx: OrgContext,
  input: ReportBlockerInput & { reported_by: string },
): Promise<Blocker> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .insert({
      task_id: input.task_id,
      org_id: ctx.orgId,
      description: input.description,
      reported_by: input.reported_by,
    })
    .select()
    .single();

  if (error) throw new QueryError(error.message, TABLE, "createBlocker", ctx.orgId, error);
  return data as Blocker;
}

export async function getBlockerById(
  ctx: OrgContext,
  blockerId: string,
): Promise<Blocker | null> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select()
    .eq("id", blockerId)
    .eq("org_id", ctx.orgId)
    .single();

  if (error && error.code === "PGRST116") return null; // Not found
  if (error) throw new QueryError(error.message, TABLE, "getBlockerById", ctx.orgId, error);
  return data as Blocker;
}

/**
 * Get the latest non-dismissed blocker for a task.
 */
export async function getBlockerForTask(
  ctx: OrgContext,
  taskId: string,
): Promise<Blocker | null> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select()
    .eq("task_id", taskId)
    .eq("org_id", ctx.orgId)
    .neq("resolution_status", "dismissed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new QueryError(error.message, TABLE, "getBlockerForTask", ctx.orgId, error);
  return data as Blocker | null;
}

/**
 * Get all unresolved blockers for an org.
 */
export async function getOpenBlockersForOrg(
  ctx: OrgContext,
): Promise<Blocker[]> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select()
    .eq("org_id", ctx.orgId)
    .not("resolution_status", "in", '("resolved","dismissed")')
    .order("created_at", { ascending: false });

  if (error) throw new QueryError(error.message, TABLE, "getOpenBlockersForOrg", ctx.orgId, error);
  return (data ?? []) as Blocker[];
}

export async function updateBlocker(
  ctx: OrgContext,
  blockerId: string,
  updates: Partial<
    Pick<
      Blocker,
      | "blocker_type"
      | "blocker_type_secondary"
      | "classification_confidence"
      | "classification_reasoning"
      | "resolution_status"
      | "resolution_output"
      | "resolution_metadata"
      | "resolved_at"
      | "resolved_by"
      | "escalation_level"
      | "last_escalated_at"
      | "inngest_run_id"
    >
  >,
): Promise<Blocker> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .update(updates)
    .eq("id", blockerId)
    .eq("org_id", ctx.orgId)
    .select()
    .single();

  if (error) throw new QueryError(error.message, TABLE, "updateBlocker", ctx.orgId, error);
  return data as Blocker;
}

/**
 * Get blockers that need escalation — unresolved and older than the given timestamp.
 */
export async function getStaleBlockers(
  ctx: OrgContext,
  olderThan: string,
  maxEscalationLevel: number,
): Promise<Blocker[]> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select()
    .eq("org_id", ctx.orgId)
    .in("resolution_status", ["classified", "resolving", "escalated"])
    .lt("escalation_level", maxEscalationLevel)
    .lt("created_at", olderThan)
    .order("created_at", { ascending: true });

  if (error) throw new QueryError(error.message, TABLE, "getStaleBlockers", ctx.orgId, error);
  return (data ?? []) as Blocker[];
}
