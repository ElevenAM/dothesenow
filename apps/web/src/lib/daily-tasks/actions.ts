"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import { dispatchTask, getExecutorAvailability } from "@/lib/daily-tasks/dispatch";
import { getDepartmentId } from "@/lib/departments";
import { getAllExecutorMetadata } from "@/lib/executors/registry";
import {
  getTasksForOrg,
  getTasksSummary,
  createTaskForOrg,
  updateTaskForOrg,
  transitionTaskStatus,
  getMembershipsForOrg,
  getStrategyDocs,
  getCreditBalance,
  getOrgIntegrations,
} from "@dothesenow/queries";
import { TASK_DECOMPOSITION_COST } from "@dothesenow/prompts";
import { inngest } from "@/lib/inngest/client";
import type {
  DailyTask,
  DailyTaskWithProfiles,
  DailyTasksSummary,
  CreateTaskInput,
  UpdateTaskInput,
} from "@dothesenow/types";

export type { DailyTasksSummary } from "@dothesenow/types";
// Re-export DailyTaskWithProfiles as DailyTask for backward compatibility —
// the old local DailyTask interface included the joined profile fields.
export type { DailyTaskWithProfiles as DailyTask } from "@dothesenow/types";

export interface TeamMember {
  userId: string;
  displayName: string | null;
  email: string;
  role: string;
  specialties: string[];
}

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

export async function getDailyTasks(
  deptSlug: string,
  date?: string,
): Promise<DailyTaskWithProfiles[]> {
  const { ctx } = await getAuthenticatedOrgContext();
  const targetDate = date || todayString();
  const departmentId = await getDepartmentId(ctx.orgId, deptSlug);

  const tasks = await getTasksForOrg(ctx, {
    scheduled_date: targetDate,
    department_id: departmentId ?? undefined,
  });

  // Client-side priority sort (one day's tasks is a small set)
  tasks.sort(
    (a, b) =>
      (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3),
  );

  return tasks;
}

export async function getDailyTasksSummary(
  deptSlug: string,
  date?: string,
): Promise<DailyTasksSummary[]> {
  const { ctx } = await getAuthenticatedOrgContext();
  const targetDate = date || todayString();
  return getTasksSummary(ctx, targetDate);
}

export async function createDailyTask(
  deptSlug: string,
  taskData: CreateTaskInput & { assigned_to?: string },
): Promise<DailyTask> {
  const { auth, ctx } = await getAuthenticatedOrgContext();
  const departmentId = await getDepartmentId(ctx.orgId, deptSlug);

  const created = await createTaskForOrg(ctx, {
    ...taskData,
    department_id: departmentId,
    created_by: auth.user.id,
    assigned_to: taskData.assigned_to || auth.user.id,
    scheduled_date: taskData.scheduled_date || todayString(),
  });

  // Dispatch to executor if non-self (awaited to prevent serverless termination)
  await dispatchTask(created);

  revalidatePath("/", "layout");
  return created;
}

export async function updateDailyTask(
  taskId: string,
  updates: UpdateTaskInput,
): Promise<DailyTask> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  // If status is changing, use the state machine RPC
  if (updates.status) {
    await transitionTaskStatus(
      ctx,
      taskId,
      updates.status,
      "web_ui",
      auth.user.id,
    );
  }

  // Apply remaining non-status fields
  const { status: _status, ...nonStatusUpdates } = updates;
  let result: DailyTask | undefined;
  if (Object.keys(nonStatusUpdates).length > 0) {
    result = await updateTaskForOrg(ctx, taskId, nonStatusUpdates);
  }

  // If only status changed, fetch the updated task
  if (!result) {
    const { getTaskById } = await import("@dothesenow/queries");
    const task = await getTaskById(ctx, taskId);
    if (!task) throw new Error("Task not found after status transition");
    result = task;
  }

  revalidatePath("/", "layout");
  return result;
}

export async function completeDailyTask(
  taskId: string,
  outcomeNotes?: string,
): Promise<DailyTask> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  await transitionTaskStatus(ctx, taskId, "completed", "web_ui", auth.user.id);

  let task: DailyTask;
  if (outcomeNotes) {
    task = await updateTaskForOrg(ctx, taskId, { outcome_notes: outcomeNotes });
  } else {
    const { getTaskById } = await import("@dothesenow/queries");
    const fetched = await getTaskById(ctx, taskId);
    if (!fetched) throw new Error("Task not found after completion");
    task = fetched;
  }

  revalidatePath("/", "layout");
  return task;
}

export async function skipDailyTask(taskId: string): Promise<DailyTask> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  await transitionTaskStatus(ctx, taskId, "skipped", "web_ui", auth.user.id);

  const { getTaskById } = await import("@dothesenow/queries");
  const task = await getTaskById(ctx, taskId);
  if (!task) throw new Error("Task not found after skip");

  revalidatePath("/", "layout");
  return task;
}

/**
 * Carry over incomplete tasks from a previous date to today.
 *
 * Uses a 2-step approach: INSERT copies for today, then batch UPDATE originals
 * to 'carried_over' status.
 *
 * NOTE: The batch UPDATE intentionally bypasses transition_task_status() RPC.
 * Using the RPC in a loop would introduce N+1 round-trips, lock contention,
 * and partial-failure risk with no rollback. The batch approach is atomic per
 * org and the state machine transitions (pending→carried_over, in_progress→
 * carried_over) are all valid per migration 013.
 */
export async function carryOverTasks(
  deptSlug: string,
  fromDate: string,
): Promise<{ count: number }> {
  const { ctx } = await getAuthenticatedOrgContext();
  const supabase = await createClient();
  const departmentId = await getDepartmentId(ctx.orgId, deptSlug);
  const today = todayString();

  // Step 1: Fetch eligible tasks (don't modify yet)
  let fetchQuery = supabase
    .from("dtn_daily_tasks")
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("scheduled_date", fromDate)
    .in("status", ["pending", "in_progress"]);

  if (departmentId) {
    fetchQuery = fetchQuery.eq("department_id", departmentId);
  }

  const { data: eligible, error: fetchError } = await fetchQuery;
  if (fetchError) throw new Error(fetchError.message);

  if (!eligible || eligible.length === 0) {
    return { count: 0 };
  }

  // Step 2: Insert copies FIRST — if this fails, originals are untouched (safe to retry)
  const copies = eligible.map((task: Record<string, unknown>) => ({
    org_id: ctx.orgId,
    department_id: task.department_id,
    created_by: task.created_by,
    assigned_to: task.assigned_to,
    title: task.title,
    description: task.description,
    task_type: task.task_type,
    priority: task.priority,
    executor_type: task.executor_type,
    executor_config: task.executor_config,
    mktg_task_id: task.mktg_task_id,
    status: "pending",
    scheduled_date: today,
    source_strategy: task.source_strategy,
    strategy_doc_id: task.strategy_doc_id,
    strategy_section_ref: task.strategy_section_ref,
    experiment_id: task.experiment_id,
    duration_minutes: task.duration_minutes,
    recommended_assignee_role: task.recommended_assignee_role,
    campaign_id: task.campaign_id,
    contact_id: task.contact_id,
    generated_by: task.generated_by,
    generation_context: task.generation_context,
  }));

  const { error: insertError } = await supabase
    .from("dtn_daily_tasks")
    .insert(copies);
  if (insertError) throw new Error(insertError.message);

  // Step 3: Only mark originals as carried_over AFTER copies are safely inserted
  // (intentional state-machine bypass — see JSDoc above)
  const eligibleIds = eligible.map((t: Record<string, unknown>) => t.id as string);
  const { error: markError } = await supabase
    .from("dtn_daily_tasks")
    .update({ status: "carried_over" as const })
    .in("id", eligibleIds)
    .eq("org_id", ctx.orgId);

  if (markError) {
    console.error(
      `[carry-over] Copies inserted but failed to mark originals as carried_over:`,
      markError.message,
    );
  }

  revalidatePath("/", "layout");
  return { count: eligible.length };
}

export async function fetchExecutorAvailability(): Promise<ReturnType<typeof getExecutorAvailability>> {
  const { ctx } = await getAuthenticatedOrgContext();
  const integrations = await getOrgIntegrations(ctx);
  return getExecutorAvailability(integrations);
}

export async function fetchExecutorTypes(): Promise<
  { value: string; label: string; icon: string }[]
> {
  return getAllExecutorMetadata().map((m) => ({
    value: m.type,
    label: m.label,
    icon: m.icon,
  }));
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const { ctx } = await getAuthenticatedOrgContext();
  const memberships = await getMembershipsForOrg(ctx);

  return memberships
    .filter((m) => m.user_id !== null)
    .map((m) => ({
      userId: m.user_id as string,
      displayName: m.profile?.display_name ?? null,
      email: m.profile?.email ?? "",
      role: m.role,
      specialties: m.specialties ?? [],
    }));
}

/**
 * Trigger AI task generation for a given date.
 * Validates strategy doc exists and credits are sufficient before sending event.
 */
export async function generateDailyTasks(
  deptSlug: string,
  date?: string,
): Promise<{ success: boolean }> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  // Validate: active strategy doc exists
  const docs = await getStrategyDocs(ctx, {
    is_active: true,
    doc_type: "master_strategy",
  });
  if (docs.length === 0) {
    throw new Error("No active strategy document. Generate a strategy first.");
  }

  // Validate: sufficient credits
  const { remaining } = await getCreditBalance(ctx);
  if (remaining < TASK_DECOMPOSITION_COST) {
    throw new Error(
      `Insufficient credits. Need ${TASK_DECOMPOSITION_COST}, have ${remaining}.`,
    );
  }

  // When no date is provided, omit target_date entirely — the Inngest
  // function computes it from the org's timezone, avoiding the UTC mismatch
  // that todayString() would introduce for late-evening users in UTC- zones.
  await inngest.send({
    name: "task/decompose.manual",
    data: {
      org_id: ctx.orgId,
      triggered_by: auth.user.id,
      target_date: date || "",
    },
  });

  revalidatePath("/", "layout");
  return { success: true };
}
