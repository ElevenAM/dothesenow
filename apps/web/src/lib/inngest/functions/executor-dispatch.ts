import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getTaskById,
  reserveCredits,
  confirmCredits,
  refundByReference,
  getOrgIntegration,
  getIntegrationSecret,
  updateIntegrationLastUsed,
} from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import type { ExecutorRuntimeConfig } from "@dothesenow/types";
import { getExecutor } from "@/lib/executors/registry";

/**
 * Unified executor dispatch — all dispatchable executors (Claude, n8n, Jasper, etc.)
 * route through this durable function.
 *
 * Steps:
 * 1. Load executor definition from registry
 * 2. Load task (idempotency guard — skip if not in_progress)
 * 3. Load integration config + decrypt Vault secret (if needed)
 * 4. Reserve credits (skip for BYOS and Claude)
 * 5. Call executor.dispatch()
 * 6. Update integration last_used_at
 * 7. Confirm credits (if reserved)
 *
 * On failure: mark task failed, refund credits, update integration last_error.
 */
export const executorDispatch = inngest.createFunction(
  {
    id: "executor-dispatch",
    triggers: [{ event: "task/dispatch.requested" }],
    concurrency: [{ limit: 5, key: "event.data.executor_type" }],
    rateLimit: { limit: 20, period: "1m", key: "event.data.org_id" },
    idempotency: "event.data.task_id",
    retries: 2,
    onFailure: async ({ event, error }) => {
      const { task_id, org_id, executor_type } = event.data.event.data as {
        task_id: string;
        org_id: string;
        executor_type: string;
      };
      console.error(
        `[inngest:executor-dispatch] Failed for task ${task_id} (${executor_type}):`,
        error.message,
      );

      const supabase = createAdminClient();

      // Mark task as failed
      const { error: dbError } = await supabase
        .from("dtn_daily_tasks")
        .update({
          status: "failed",
          outcome_notes: `Executor dispatch failed (${executor_type}): ${error.message}`,
        })
        .eq("id", task_id)
        .eq("org_id", org_id);

      if (dbError) {
        console.error(
          `[inngest:executor-dispatch] Also failed to mark task ${task_id} as failed:`,
          dbError.message,
        );
      }

      // Refund any reserved credits
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      try {
        await refundByReference(ctx, task_id);
      } catch (refundErr) {
        console.error(
          `[inngest:executor-dispatch] Credit refund failed for task ${task_id}:`,
          refundErr,
        );
      }

      // Update integration last_error
      try {
        await updateIntegrationLastUsed(
          supabase,
          org_id,
          executor_type,
          error.message,
        );
      } catch (lastUsedErr) {
        console.warn(
          `[inngest:executor-dispatch] Failed to update last_error for ${executor_type}:`,
          lastUsedErr,
        );
      }
    },
  },
  async ({ event, step }) => {
    const { task_id, org_id, executor_type } = event.data;
    const supabase = createAdminClient();
    const ctx: OrgContext = { client: supabase, orgId: org_id };

    // Step 1: Load executor definition
    const executor = getExecutor(executor_type);
    if (!executor) {
      throw new Error(`Unknown executor type: ${executor_type}`);
    }

    // Step 2: Load task with idempotency guard
    const task = await step.run("load-task", async () => {
      console.log("[inngest:executor-dispatch] load-task", {
        taskId: task_id,
        executor: executor_type,
      });

      const t = await getTaskById(ctx, task_id);
      if (!t) throw new Error(`Task not found: ${task_id}`);

      // Idempotency: only process tasks that are in_progress
      if (t.status !== "in_progress") {
        console.log(
          `[inngest:executor-dispatch] Skipping task ${task_id} — status is ${t.status}, not in_progress`,
        );
        return null;
      }

      return t;
    });

    if (!task) return { skipped: true, task_id };

    // Step 3: Load integration config + decrypt Vault secret
    const runtimeConfig = await step.run("load-config", async () => {
      console.log("[inngest:executor-dispatch] load-config", {
        taskId: task_id,
        executor: executor_type,
      });

      const integration = await getOrgIntegration(ctx, executor_type);
      let secret: string | null = null;

      if (integration?.vault_secret_id) {
        secret = await getIntegrationSecret(supabase, integration.vault_secret_id);
      }

      const callbackUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}/api/webhooks/n8n`
        : "http://localhost:3000/api/webhooks/n8n";

      return { integration, secret, callbackUrl } as ExecutorRuntimeConfig;
    });

    // Step 4: Reserve credits (skip for BYOS and Claude)
    // Claude: agent-executor handles its own credits
    // BYOS: estimateCredits returns 0
    const credits = executor.estimateCredits(task);
    let ledgerId: string | null = null;

    if (credits > 0 && executor_type !== "claude_api") {
      ledgerId = await step.run("reserve-credits", async () => {
        console.log("[inngest:executor-dispatch] reserve-credits", {
          taskId: task_id,
          credits,
        });
        return reserveCredits(ctx, credits, `executor:${executor_type}`, task_id);
      });
    }

    // Step 5: Call executor.dispatch()
    await step.run("dispatch", async () => {
      console.log("[inngest:executor-dispatch] dispatch", {
        taskId: task_id,
        executor: executor_type,
      });
      await executor.dispatch(task, runtimeConfig);
    });

    // Step 6: Update integration last_used_at
    await step.run("update-last-used", async () => {
      if (runtimeConfig.integration) {
        await updateIntegrationLastUsed(supabase, org_id, executor_type);
      }
    });

    // Step 7: Confirm credits (if reserved)
    if (ledgerId) {
      await step.run("confirm-credits", async () => {
        console.log("[inngest:executor-dispatch] confirm-credits", {
          taskId: task_id,
          ledgerId,
        });
        await confirmCredits(ctx, ledgerId!);
      });
    }

    return { success: true, task_id, executor_type };
  },
);
