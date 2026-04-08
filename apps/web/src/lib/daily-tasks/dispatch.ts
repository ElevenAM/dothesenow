import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import { getExecutor, getExecutorAvailability as registryGetAvailability } from "@/lib/executors/registry";
import type { DispatchableTask, OrgIntegration } from "@dothesenow/types";

export type { DispatchableTask };

/**
 * Dispatch a task to its executor via the Inngest executor-dispatch function.
 *
 * No-op executors (self, freelancer) are skipped.
 * All dispatchable executors (Claude, n8n, Jasper, etc.) go through the unified
 * `task/dispatch.requested` Inngest event.
 *
 * NOTE: Uses createAdminClient() and direct .update() calls instead of the
 * transition_task_status() RPC. This is intentional: the RPC requires auth.uid()
 * which returns NULL for service_role clients. Dispatch runs in a background/
 * serverless context where no authenticated user session exists.
 * Only called from web app server actions (not MCP).
 */
export async function dispatchTask(task: DispatchableTask): Promise<void> {
  const executor = getExecutor(task.executor_type);
  if (!executor) {
    // No-op executor (self, freelancer) — nothing to dispatch
    return;
  }

  const supabase = createAdminClient();

  // Mark task as in_progress before handing off to Inngest
  const { error: updateError } = await supabase
    .from("dtn_daily_tasks")
    .update({ status: "in_progress" })
    .eq("id", task.id)
    .eq("org_id", task.org_id);

  if (updateError) {
    throw new Error(`Failed to mark task ${task.id} as in_progress: ${updateError.message}`);
  }

  // Send to unified executor-dispatch Inngest function.
  // If this fails, roll back status so the task doesn't stay in_progress forever.
  try {
    await inngest.send({
      name: "task/dispatch.requested",
      data: {
        task_id: task.id,
        org_id: task.org_id,
        executor_type: task.executor_type,
      },
    });
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : String(sendError);
    console.error(`[dispatch] inngest.send failed for task ${task.id}:`, message);

    // Roll back to pending so the task isn't orphaned as in_progress
    await supabase
      .from("dtn_daily_tasks")
      .update({
        status: "pending",
        outcome_notes: `Dispatch failed: ${message}`,
      })
      .eq("id", task.id)
      .eq("org_id", task.org_id);

    throw sendError;
  }
}

/**
 * Get executor availability for the task form UI.
 * Delegates to the registry, which checks env vars and org integrations.
 */
export function getExecutorAvailability(
  orgIntegrations: OrgIntegration[] = [],
): Record<string, { available: boolean; hint?: string }> {
  return registryGetAvailability(orgIntegrations);
}
