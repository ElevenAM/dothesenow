"use server";

import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import { trackServerEvent } from "@/lib/analytics";
import { dispatchTask } from "@/lib/daily-tasks/dispatch";
import { getDepartmentId } from "@/lib/departments";
import {
  createTaskForOrg,
  updateTaskForOrg,
  transitionTaskStatus,
  completeTaskViaStateMachine,
  getStrategyDocs,
  getCreditBalance,
  createMarketplaceTask,
} from "@dothesenow/queries";
import type { CreateMarketplaceTaskInput, ExecutorType } from "@dothesenow/types";
import { TASK_DECOMPOSITION_COST } from "@dothesenow/prompts";
import { inngest } from "@/lib/inngest/client";
import type {
  DailyTask,
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

function todayString(timezone?: string | null): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone ?? "America/New_York" });
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
    scheduled_date: taskData.scheduled_date || todayString(auth.org.timezone),
  });

  // Dispatch to executor if non-self (awaited to prevent serverless termination)
  await dispatchTask(created);

  trackServerEvent(auth.user.id, "task_created", { orgId: ctx.orgId });

  revalidateTag("tasks", "max");
  revalidateTag("overview", "max");
  return created;
}

export async function updateDailyTask(
  taskId: string,
  updates: UpdateTaskInput,
): Promise<DailyTask> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  // If status is changing, use the state machine RPC
  let oldStatus: string | undefined;
  if (updates.status) {
    // Fetch current status before transition for thread sync event
    const { getTaskById } = await import("@dothesenow/queries");
    const current = await getTaskById(ctx, taskId);
    oldStatus = current?.status;

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

  // Emit thread sync event for Slack bidirectional updates
  if (updates.status && oldStatus && oldStatus !== updates.status) {
    inngest
      .send({
        name: "task/status.changed",
        data: {
          task_id: taskId,
          org_id: ctx.orgId,
          old_status: oldStatus,
          new_status: updates.status,
          source: "web_ui",
          actor_id: auth.user.id,
          changed_at: new Date().toISOString(),
        },
      })
      .catch((err) => {
        console.error("[actions] Failed to emit task/status.changed:", err);
      });
  }

  revalidateTag("tasks", "max");
  revalidateTag("overview", "max");
  return result;
}

export async function completeDailyTask(
  taskId: string,
  outcomeNotes?: string,
): Promise<DailyTask> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  // Fetch current status before transition for thread sync
  const { getTaskById } = await import("@dothesenow/queries");
  const current = await getTaskById(ctx, taskId);
  const oldStatus = current?.status ?? "pending";

  // Step-through completion via shared helper (handles already-completed no-op)
  let task = await completeTaskViaStateMachine(ctx, taskId, "web_ui", auth.user.id);

  if (outcomeNotes) {
    task = await updateTaskForOrg(ctx, taskId, { outcome_notes: outcomeNotes });
  }

  // Emit thread sync event
  inngest
    .send({
      name: "task/status.changed",
      data: {
        task_id: taskId,
        org_id: ctx.orgId,
        old_status: oldStatus,
        new_status: "completed",
        source: "web_ui",
        actor_id: auth.user.id,
        changed_at: new Date().toISOString(),
      },
    })
    .catch((err) => {
      console.error("[actions] Failed to emit task/status.changed:", err);
    });

  trackServerEvent(auth.user.id, "task_completed", { orgId: ctx.orgId });

  revalidateTag("tasks", "max");
  revalidateTag("overview", "max");
  return task;
}

/**
 * Reopen a completed task back to pending.
 * Uses the state machine RPC (completed -> pending is now an allowed transition)
 * so the audit event log in dtn_task_events is properly maintained.
 */
export async function reopenDailyTask(taskId: string): Promise<DailyTask> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  const { getTaskById } = await import("@dothesenow/queries");
  const current = await getTaskById(ctx, taskId);
  if (!current) throw new Error("Task not found");
  const oldStatus = current.status;

  await transitionTaskStatus(ctx, taskId, "pending", "web_ui", auth.user.id);

  inngest
    .send({
      name: "task/status.changed",
      data: {
        task_id: taskId,
        org_id: ctx.orgId,
        old_status: oldStatus,
        new_status: "pending",
        source: "web_ui",
        actor_id: auth.user.id,
        changed_at: new Date().toISOString(),
      },
    })
    .catch((err) => {
      console.error("[actions] Failed to emit task/status.changed:", err);
    });

  revalidateTag("tasks", "max");
  revalidateTag("overview", "max");

  const updated = await getTaskById(ctx, taskId);
  if (!updated) throw new Error("Task not found after reopen");
  return updated;
}

export async function skipDailyTask(taskId: string): Promise<DailyTask> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  // Fetch current status before transition for thread sync
  const { getTaskById } = await import("@dothesenow/queries");
  const current = await getTaskById(ctx, taskId);
  const oldStatus = current?.status ?? "pending";

  await transitionTaskStatus(ctx, taskId, "skipped", "web_ui", auth.user.id);

  const task = await getTaskById(ctx, taskId);
  if (!task) throw new Error("Task not found after skip");

  // Emit thread sync event
  inngest
    .send({
      name: "task/status.changed",
      data: {
        task_id: taskId,
        org_id: ctx.orgId,
        old_status: oldStatus,
        new_status: "skipped",
        source: "web_ui",
        actor_id: auth.user.id,
        changed_at: new Date().toISOString(),
      },
    })
    .catch((err) => {
      console.error("[actions] Failed to emit task/status.changed:", err);
    });

  revalidateTag("tasks", "max");
  revalidateTag("overview", "max");
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
  const { auth, ctx } = await getAuthenticatedOrgContext();
  const supabase = await createClient();
  const departmentId = await getDepartmentId(ctx.orgId, deptSlug);
  const today = todayString(auth.org.timezone);

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
    throw new Error(
      `Copies inserted but failed to mark originals as carried_over: ${markError.message}`,
    );
  } else {
    // Emit thread sync events for all carried-over tasks (fire-and-forget)
    const changedAt = new Date().toISOString();
    const events = eligible.map((t: Record<string, unknown>) => ({
      name: "task/status.changed" as const,
      data: {
        task_id: t.id as string,
        org_id: ctx.orgId,
        old_status: t.status as string,
        new_status: "carried_over",
        source: "web_ui",
        actor_id: null,
        changed_at: changedAt,
      },
    }));

    inngest.send(events).catch((err) => {
      console.error("[carry-over] Failed to emit task/status.changed events:", err);
    });
  }

  revalidateTag("tasks", "max");
  revalidateTag("overview", "max");
  return { count: eligible.length };
}

/**
 * Trigger AI task generation for a given date.
 * Validates strategy doc exists and credits are sufficient before sending event.
 *
 * When `skipIfExists` is true (used by auto-trigger), silently returns success
 * if AI-generated tasks already exist for this date — prevents duplicate
 * generation from auto-trigger + cron both firing. Manual button should pass
 * false (the default) so users can always re-generate.
 */
export async function generateDailyTasks(
  deptSlug: string,
  date?: string,
  skipIfExists = false,
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

  // For auto-trigger: skip if tasks already exist (prevents auto + cron duplication)
  if (skipIfExists && date) {
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("dtn_daily_tasks")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("scheduled_date", date)
      .eq("generated_by", "claude")
      .limit(1);

    if (existing && existing.length > 0) {
      revalidateTag("tasks", "max");
      return { success: true };
    }
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

  trackServerEvent(auth.user.id, "tasks_generated", { orgId: ctx.orgId });

  revalidateTag("tasks", "max");
  revalidateTag("overview", "max");
  return { success: true };
}

/**
 * Change a task's executor type and optionally dispatch it or post to marketplace.
 * Only allowed for tasks in "pending" status.
 */
export async function changeTaskExecutor(
  taskId: string,
  newExecutorType: string,
  marketplaceData?: {
    deliverables: string;
    required_skills: string[];
    budget?: number;
  },
): Promise<DailyTask> {
  const { ctx } = await getAuthenticatedOrgContext();

  // Fetch current task and validate state
  const { getTaskById } = await import("@dothesenow/queries");
  const current = await getTaskById(ctx, taskId);
  if (!current) throw new Error("Task not found");
  if (current.status !== "pending") {
    throw new Error("Can only change executor on pending tasks");
  }

  // Update executor type
  const updated = await updateTaskForOrg(ctx, taskId, {
    executor_type: newExecutorType as ExecutorType,
  });

  // If changing to freelancer, create a marketplace task
  if (newExecutorType === "freelancer" && marketplaceData) {
    const mktgTask = await createMarketplaceTask(ctx, {
      title: updated.title,
      description: updated.description ?? "",
      brief: updated.description ?? updated.title,
      task_type: updated.task_type === "create" ? "blog_post" : "other",
      deliverables: marketplaceData.deliverables,
      required_skills: marketplaceData.required_skills,
      budget: marketplaceData.budget ?? null,
      payment_type: "fixed",
      priority: updated.priority,
    });

    // Link the marketplace task back to the daily task (direct update
    // since mktg_task_id isn't in the UpdateTaskInput type)
    const supabase = await createClient();
    const { error: linkError } = await supabase
      .from("dtn_daily_tasks")
      .update({ mktg_task_id: mktgTask.id })
      .eq("id", taskId)
      .eq("org_id", ctx.orgId);

    if (linkError) {
      throw new Error(`Failed to link marketplace task: ${linkError.message}`);
    }
  }

  // If changing to a dispatchable executor, dispatch it.
  // Re-fetch to get all fields required by DispatchableTask.
  if (["claude_api", "n8n", "jasper_api"].includes(newExecutorType)) {
    const fullTask = await getTaskById(ctx, taskId);
    if (fullTask) {
      await dispatchTask(fullTask);
    }
  }

  revalidateTag("tasks", "max");
  revalidateTag("overview", "max");
  return updated;
}
