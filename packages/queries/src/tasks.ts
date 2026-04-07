import type { OrgContext } from "./context.js";
import type {
  DailyTask,
  DailyTaskWithProfiles,
  DailyTasksSummary,
  CreateTaskInput,
  UpdateTaskInput,
  TaskFilters,
  TaskStatus,
  TransitionSource,
} from "@dothesenow/types";
import { QueryError } from "./errors.js";

const TABLE = "dtn_daily_tasks";
const SUMMARY_VIEW = "dtn_daily_tasks_summary";

const PROFILE_SELECT =
  "*, assigned_profile:profiles!dtn_daily_tasks_assigned_to_fkey(display_name, email), creator_profile:profiles!dtn_daily_tasks_created_by_fkey(display_name, email)";

export async function getTasksForOrg(
  ctx: OrgContext,
  filters?: TaskFilters & { scheduled_date?: string; department_id?: string },
): Promise<DailyTaskWithProfiles[]> {
  let query = ctx.client
    .from(TABLE)
    .select(PROFILE_SELECT)
    .eq("org_id", ctx.orgId);

  if (filters?.scheduled_date) {
    query = query.eq("scheduled_date", filters.scheduled_date);
  }
  if (filters?.department_id) {
    query = query.eq("department_id", filters.department_id);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.priority) {
    query = query.eq("priority", filters.priority);
  }
  if (filters?.executor_type) {
    query = query.eq("executor_type", filters.executor_type);
  }
  if (filters?.assigned_to) {
    query = query.eq("assigned_to", filters.assigned_to);
  }
  if (filters?.date_from) {
    query = query.gte("scheduled_date", filters.date_from);
  }
  if (filters?.date_to) {
    query = query.lte("scheduled_date", filters.date_to);
  }

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) throw new QueryError(error.message, TABLE, "getTasksForOrg", ctx.orgId, error);
  return (data ?? []) as DailyTaskWithProfiles[];
}

export async function getTaskById(
  ctx: OrgContext,
  taskId: string,
): Promise<DailyTask | null> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("id", taskId)
    .maybeSingle();

  if (error) throw new QueryError(error.message, TABLE, "getTaskById", ctx.orgId, error);
  return data as DailyTask | null;
}

export async function getTasksSummary(
  ctx: OrgContext,
  scheduledDate: string,
): Promise<DailyTasksSummary[]> {
  const { data, error } = await ctx.client
    .from(SUMMARY_VIEW)
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("scheduled_date", scheduledDate);

  if (error) throw new QueryError(error.message, SUMMARY_VIEW, "getTasksSummary", ctx.orgId, error);
  return (data ?? []) as DailyTasksSummary[];
}

export async function getOverdueTasks(
  ctx: OrgContext,
  beforeDate: string,
): Promise<DailyTask[]> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .lt("scheduled_date", beforeDate)
    .in("status", ["pending", "in_progress"])
    .order("scheduled_date", { ascending: true });

  if (error) throw new QueryError(error.message, TABLE, "getOverdueTasks", ctx.orgId, error);
  return (data ?? []) as DailyTask[];
}

export async function getCarryoverCandidates(
  ctx: OrgContext,
  scheduledDate: string,
): Promise<DailyTask[]> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("scheduled_date", scheduledDate)
    .in("status", ["pending", "in_progress", "failed"])
    .order("priority");

  if (error) throw new QueryError(error.message, TABLE, "getCarryoverCandidates", ctx.orgId, error);
  return (data ?? []) as DailyTask[];
}

export async function createTaskForOrg(
  ctx: OrgContext,
  task: CreateTaskInput & { created_by?: string; assigned_to?: string },
): Promise<DailyTask> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .insert({
      ...task,
      org_id: ctx.orgId,
      scheduled_date: task.scheduled_date ?? new Date().toISOString().split("T")[0],
    })
    .select()
    .single();

  if (error) throw new QueryError(error.message, TABLE, "createTaskForOrg", ctx.orgId, error);
  return data as DailyTask;
}

export async function updateTaskForOrg(
  ctx: OrgContext,
  taskId: string,
  updates: UpdateTaskInput,
): Promise<DailyTask> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .update(updates)
    .eq("id", taskId)
    .eq("org_id", ctx.orgId)
    .select()
    .single();

  if (error) throw new QueryError(error.message, TABLE, "updateTaskForOrg", ctx.orgId, error);
  return data as DailyTask;
}

export async function bulkCreateTasks(
  ctx: OrgContext,
  tasks: (CreateTaskInput & { created_by?: string; assigned_to?: string })[],
): Promise<DailyTask[]> {
  const rows = tasks.map((task) => ({
    ...task,
    org_id: ctx.orgId,
    scheduled_date: task.scheduled_date ?? new Date().toISOString().split("T")[0],
  }));

  const { data, error } = await ctx.client
    .from(TABLE)
    .insert(rows)
    .select();

  if (error) throw new QueryError(error.message, TABLE, "bulkCreateTasks", ctx.orgId, error);
  return (data ?? []) as DailyTask[];
}

/**
 * Transition a task's status through the state machine.
 * Uses the transition_task_status() RPC which validates transitions,
 * records audit events, and handles completed_at.
 */
export async function transitionTaskStatus(
  ctx: OrgContext,
  taskId: string,
  newStatus: TaskStatus,
  source: TransitionSource,
  actorId?: string | null,
  metadata?: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await ctx.client.rpc("transition_task_status", {
    p_task_id: taskId,
    p_org_id: ctx.orgId,
    p_new_status: newStatus,
    p_source: source,
    p_actor_id: actorId ?? null,
    p_metadata: metadata ?? {},
  });

  if (error) throw new QueryError(error.message, TABLE, "transitionTaskStatus", ctx.orgId, error);
  return data as string;
}

/**
 * Carry over incomplete tasks from one date to another.
 * Uses the carry_over_tasks_v2() RPC for atomic all-or-nothing execution.
 * Each carried-over task gets an audit event via the state machine.
 */
export async function carryOverTasks(
  ctx: OrgContext,
  fromDate: string,
  toDate?: string,
  source?: TransitionSource,
  actorId?: string | null,
): Promise<{ carried_count: number; new_task_ids: string[]; from_date: string; to_date: string }> {
  const { data, error } = await ctx.client.rpc("carry_over_tasks_v2", {
    p_org_id: ctx.orgId,
    p_from_date: fromDate,
    p_to_date: toDate ?? new Date().toISOString().split("T")[0],
    p_source: source ?? "mcp",
    p_actor_id: actorId ?? null,
  });

  if (error) throw new QueryError(error.message, TABLE, "carryOverTasks", ctx.orgId, error);
  return data as { carried_count: number; new_task_ids: string[]; from_date: string; to_date: string };
}
