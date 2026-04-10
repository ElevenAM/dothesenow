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
  Json,
} from "@dothesenow/types";
import { QueryError } from "./errors.js";
import { logOutreach } from "./contacts.js";

const TABLE = "dtn_daily_tasks";
const SUMMARY_VIEW = "dtn_daily_tasks_summary";

const PROFILE_SELECT =
  "*, assigned_profile:profiles!dtn_daily_tasks_assigned_to_profiles_fkey(display_name, email), creator_profile:profiles!dtn_daily_tasks_created_by_profiles_fkey(display_name, email)";

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
    // Show tasks assigned to this department OR org-wide tasks (null department)
    query = query.or(
      `department_id.eq.${filters.department_id},department_id.is.null`,
    );
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
 * Complete a task through the state machine with step-through logic.
 * If the task is not in_progress, transitions to in_progress first,
 * then to completed. No-ops if already completed.
 *
 * Shared between web UI (completeDailyTask) and MCP (update_daily_task)
 * to ensure consistent completion semantics across entry points.
 */
export async function completeTaskViaStateMachine(
  ctx: OrgContext,
  taskId: string,
  source: TransitionSource,
  actorId?: string | null,
): Promise<DailyTask> {
  const current = await getTaskById(ctx, taskId);
  if (!current) throw new QueryError("Task not found", TABLE, "completeTaskViaStateMachine", ctx.orgId);

  // Already completed — no-op
  if (current.status === "completed") return current;

  // waiting_approval → completed is a valid direct transition (no step-through needed)
  // All other non-in_progress statuses must step through in_progress first
  if (current.status !== "in_progress" && current.status !== "waiting_approval") {
    await transitionTaskStatus(ctx, taskId, "in_progress" as TaskStatus, source, actorId);
  }
  await transitionTaskStatus(ctx, taskId, "completed" as TaskStatus, source, actorId);

  const updated = await getTaskById(ctx, taskId);
  if (!updated) throw new QueryError("Task not found after completion", TABLE, "completeTaskViaStateMachine", ctx.orgId);
  return updated;
}

/**
 * Transition a task's status through the state machine.
 * Uses the transition_task_status() RPC which validates transitions,
 * records audit events, and handles completed_at.
 * Requires a user-scoped client (not admin/service_role) because the RPC
 * validates org membership via auth.uid().
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

// ─── Task Result Reporting ─────────────────────────────────────

export interface ReportTaskResultInput {
  metrics: Record<string, unknown>;
  notes?: string;
  contact_ids_engaged?: string[];
}

/**
 * Record structured result metrics for a task and auto-complete it.
 * - Stores metrics in result_metrics JSONB
 * - Sets outcome_notes if provided
 * - Transitions to 'completed' via state machine (if not already terminal)
 * - Returns the updated task
 */
export async function reportTaskResult(
  ctx: OrgContext,
  taskId: string,
  input: ReportTaskResultInput,
  source: TransitionSource,
  actorId?: string | null,
): Promise<DailyTask> {
  // Load the task first to verify ownership and check current status
  const task = await getTaskById(ctx, taskId);
  if (!task) {
    throw new QueryError("Task not found", TABLE, "reportTaskResult", ctx.orgId);
  }

  // Store result metrics and outcome notes
  const updates: Record<string, unknown> = {
    result_metrics: input.metrics,
  };
  if (input.notes) {
    updates.outcome_notes = input.notes;
  }

  const { error: updateError } = await ctx.client
    .from(TABLE)
    .update(updates)
    .eq("id", taskId)
    .eq("org_id", ctx.orgId);

  if (updateError) {
    throw new QueryError(updateError.message, TABLE, "reportTaskResult", ctx.orgId, updateError);
  }

  // Auto-complete the task if it's in a non-terminal state
  const terminalStates: TaskStatus[] = [
    "completed", "skipped", "carried_over", "failed", "blocked",
  ];
  if (!terminalStates.includes(task.status as TaskStatus)) {
    try {
      await transitionTaskStatus(
        ctx,
        taskId,
        "completed" as TaskStatus,
        source,
        actorId,
        { result_metrics: input.metrics },
      );
    } catch (transitionErr) {
      console.warn(
        `[reportTaskResult] Could not auto-complete task ${taskId}: ${transitionErr instanceof Error ? transitionErr.message : transitionErr}`,
      );
    }
  }

  // Log outreach for engaged contacts (if provided)
  if (input.contact_ids_engaged && input.contact_ids_engaged.length > 0) {
    for (const contactId of input.contact_ids_engaged) {
      try {
        await logOutreach(ctx, {
          contact_id: contactId,
          channel: "other" as never,
          direction: "outbound" as never,
          content: `Engaged via task: ${task.title}`,
          status: "sent" as never,
          notes: input.notes ?? null,
          campaign_id: task.campaign_id ?? null,
        });
      } catch (outreachErr) {
        console.warn(
          `[reportTaskResult] Failed to log outreach for contact ${contactId}: ${outreachErr instanceof Error ? outreachErr.message : outreachErr}`,
        );
      }
    }
  }

  // Return the updated task
  const updated = await getTaskById(ctx, taskId);
  if (!updated) {
    throw new QueryError("Task disappeared after update", TABLE, "reportTaskResult", ctx.orgId);
  }
  return updated;
}

// ─── Task Context (enriched) ───────────────────────────────────

export interface TaskContext {
  task: DailyTask;
  strategy_doc: { doc_type: string; title: string; content: string } | null;
  campaign: { id: string; name: string; goal: string | null; status: string } | null;
  contact: {
    id: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    company: string | null;
    status: string;
    lifecycle_stage: string;
  } | null;
  recent_outreach: { channel: string; status: string; content: string; sent_at: string }[];
  similar_completed: { id: string; title: string; outcome_notes: string | null; result_metrics: Json | null; completed_at: string | null }[];
}

/**
 * Get full context for a task: the task itself + linked strategy doc,
 * campaign, contact, recent outreach, and similar completed tasks.
 * Returns everything needed to understand and execute a task in one call.
 */
export async function getTaskContext(
  ctx: OrgContext,
  taskId: string,
): Promise<TaskContext> {
  const task = await getTaskById(ctx, taskId);
  if (!task) {
    throw new QueryError("Task not found", TABLE, "getTaskContext", ctx.orgId);
  }

  // Fetch linked entities in parallel
  const [strategyResult, campaignResult, contactResult, outreachResult, similarResult] =
    await Promise.all([
      // Strategy doc (if linked via strategy_doc_id or source_strategy)
      task.strategy_doc_id
        ? ctx.client
            .from("mktg_strategy_docs")
            .select("doc_type, title, content")
            .eq("id", task.strategy_doc_id)
            .eq("org_id", ctx.orgId)
            .maybeSingle()
        : task.source_strategy
          ? ctx.client
              .from("mktg_strategy_docs")
              .select("doc_type, title, content")
              .eq("org_id", ctx.orgId)
              .eq("doc_type", task.source_strategy)
              .eq("is_active", true)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),

      // Campaign
      task.campaign_id
        ? ctx.client
            .from("mktg_campaigns")
            .select("id, name, goal, status")
            .eq("id", task.campaign_id)
            .eq("org_id", ctx.orgId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),

      // Contact
      task.contact_id
        ? ctx.client
            .from("mktg_contacts")
            .select("id, first_name, last_name, email, company, status, lifecycle_stage")
            .eq("id", task.contact_id)
            .eq("org_id", ctx.orgId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),

      // Recent outreach for linked contact (last 5)
      task.contact_id
        ? ctx.client
            .from("mktg_outreach_log")
            .select("channel, status, content, sent_at")
            .eq("contact_id", task.contact_id)
            .eq("org_id", ctx.orgId)
            .order("sent_at", { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [], error: null }),

      // Similar completed tasks (same task_type + source_strategy, last 10)
      (() => {
        let q = ctx.client
          .from(TABLE)
          .select("id, title, outcome_notes, result_metrics, completed_at")
          .eq("org_id", ctx.orgId)
          .eq("task_type", task.task_type)
          .eq("status", "completed")
          .neq("id", taskId);
        if (task.source_strategy) {
          q = q.eq("source_strategy", task.source_strategy);
        }
        return q.order("completed_at", { ascending: false }).limit(10);
      })(),
    ]);

  return {
    task,
    strategy_doc: strategyResult.data as TaskContext["strategy_doc"],
    campaign: campaignResult.data as TaskContext["campaign"],
    contact: contactResult.data as TaskContext["contact"],
    recent_outreach: (outreachResult.data ?? []) as TaskContext["recent_outreach"],
    similar_completed: (similarResult.data ?? []) as TaskContext["similar_completed"],
  };
}
