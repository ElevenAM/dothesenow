"use server";

import { revalidateTag } from "next/cache";
import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import {
  createBlocker,
  getBlockerForTask,
  getBlockerById,
  updateBlocker,
  getTaskById,
  transitionTaskStatus,
  getCreditBalance,
} from "@dothesenow/queries";
import { BLOCKER_CLASSIFICATION_COST } from "@dothesenow/prompts";
import { inngest } from "@/lib/inngest/client";
import type { Blocker, BlockerResolutionStatus } from "@dothesenow/types";

export type { Blocker } from "@dothesenow/types";

/**
 * Report a blocker on a task. Creates the blocker record and fires
 * the Inngest classification event.
 */
export async function reportBlocker(
  taskId: string,
  description: string,
): Promise<{ blocker: Blocker }> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  // Verify task exists and is in progress
  const task = await getTaskById(ctx, taskId);
  if (!task) throw new Error("Task not found");
  if (task.status !== "in_progress") {
    throw new Error("Can only report blockers on in-progress tasks");
  }

  // Verify sufficient credits for classification
  const { remaining } = await getCreditBalance(ctx);
  if (remaining < BLOCKER_CLASSIFICATION_COST) {
    throw new Error("Insufficient credits for blocker classification");
  }

  const blocker = await createBlocker(ctx, {
    task_id: taskId,
    description,
    reported_by: auth.user.id,
  });

  // Fire Inngest event for async classification
  await inngest.send({
    name: "blocker/reported",
    data: {
      blocker_id: blocker.id,
      task_id: taskId,
      org_id: ctx.orgId,
    },
  });

  revalidateTag("tasks", "max");
  return { blocker };
}

/**
 * Get the latest non-dismissed blocker for a task.
 */
export async function getTaskBlocker(
  taskId: string,
): Promise<Blocker | null> {
  const { ctx } = await getAuthenticatedOrgContext();
  return getBlockerForTask(ctx, taskId);
}

/**
 * Dismiss a blocker and unblock the task.
 * Restricted to: the blocker reporter, task assignee, or org admin/owner.
 *
 * Uses atomic conditional update to prevent TOCTOU race: if the blocker
 * was already resolved/dismissed by another actor, returns early.
 */
export async function dismissBlocker(
  blockerId: string,
): Promise<{ status: "dismissed" | "already_resolved" }> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  const blocker = await getBlockerById(ctx, blockerId);
  if (!blocker) throw new Error("Blocker not found");

  // Auth guard: reporter, assignee, or admin
  await assertBlockerPermission(auth, ctx, blocker);

  // Atomic conditional update — only update if not already resolved/dismissed
  const { data: updated } = await ctx.client
    .from("dtn_blockers")
    .update({ resolution_status: "dismissed" })
    .eq("id", blockerId)
    .eq("org_id", ctx.orgId)
    .not("resolution_status", "in", "(resolved,dismissed)")
    .select("id")
    .maybeSingle();

  if (!updated) return { status: "already_resolved" };

  // Only transition the task if it's still blocked
  const task = await getTaskById(ctx, blocker.task_id);
  if (task?.status === "blocked") {
    await transitionTaskStatus(ctx, blocker.task_id, "in_progress", "web_ui", auth.user.id, {
      blocker_id: blockerId,
      action: "dismissed",
    });
  }

  revalidateTag("tasks", "max");
  return { status: "dismissed" };
}

/**
 * Manually resolve a blocker and unblock the task.
 * Restricted to: the blocker reporter, task assignee, or org admin/owner.
 *
 * Uses atomic conditional update to prevent TOCTOU race: if the blocker
 * was already resolved/dismissed by another actor, returns early.
 */
export async function resolveBlockerManually(
  blockerId: string,
): Promise<{ status: "resolved" | "already_resolved" }> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  const blocker = await getBlockerById(ctx, blockerId);
  if (!blocker) throw new Error("Blocker not found");

  // Auth guard: reporter, assignee, or admin
  await assertBlockerPermission(auth, ctx, blocker);

  // Atomic conditional update — only update if not already resolved/dismissed
  const { data: updated } = await ctx.client
    .from("dtn_blockers")
    .update({
      resolution_status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: auth.user.id,
    })
    .eq("id", blockerId)
    .eq("org_id", ctx.orgId)
    .not("resolution_status", "in", "(resolved,dismissed)")
    .select("id")
    .maybeSingle();

  if (!updated) return { status: "already_resolved" };

  // Only transition the task if it's still blocked
  const task = await getTaskById(ctx, blocker.task_id);
  if (task?.status === "blocked") {
    await transitionTaskStatus(ctx, blocker.task_id, "in_progress", "web_ui", auth.user.id, {
      blocker_id: blockerId,
      action: "manually_resolved",
    });
  }

  revalidateTag("tasks", "max");
  return { status: "resolved" };
}

// ─── Auth helper ────────────────────────────────────────────────

async function assertBlockerPermission(
  auth: Awaited<ReturnType<typeof getAuthenticatedOrgContext>>["auth"],
  ctx: Awaited<ReturnType<typeof getAuthenticatedOrgContext>>["ctx"],
  blocker: Blocker,
): Promise<void> {
  const isReporter = blocker.reported_by === auth.user.id;
  const isAdmin = auth.membership.role === "owner" || auth.membership.role === "admin";

  if (isReporter || isAdmin) return;

  // Check if user is the task assignee
  const task = await getTaskById(ctx, blocker.task_id);
  if (task?.assigned_to === auth.user.id) return;

  throw new Error("Only the blocker reporter, task assignee, or org admin can perform this action");
}
