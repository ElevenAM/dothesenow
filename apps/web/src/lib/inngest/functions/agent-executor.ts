import { inngest } from "../client";
import { relevantDocTypes } from "../utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTaskById, reserveCredits, confirmCredits, refundByReference } from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Agent executor — replaces /api/executors/claude/route.ts with durable Inngest steps.
 *
 * 6-step flow:
 * 1. Load task (with idempotency guard)
 * 2. Load strategy context
 * 3. Reserve credits
 * 4. Call Claude API
 * 5. Create approval entry + update task status
 * 6. Confirm credits
 *
 * On failure: mark task failed + refund credits.
 */
export const agentExecutor = inngest.createFunction(
  {
    id: "agent-executor",
    triggers: [{ event: "task/agent.execute" }],
    concurrency: [{ limit: 5 }],
    rateLimit: { limit: 10, period: "1m", key: "event.data.org_id" },
    idempotency: "event.data.task_id",
    retries: 2,
    onFailure: async ({ event, error }) => {
      const { task_id, org_id } = event.data.event.data as { task_id: string; org_id: string };
      console.error(`[inngest:agent] Function failed for task ${task_id}:`, error.message);

      const supabase = createAdminClient();
      const { error: dbError } = await supabase
        .from("dtn_daily_tasks")
        .update({
          status: "failed",
          outcome_notes: `Claude execution failed: ${error.message}`,
        })
        .eq("id", task_id)
        .eq("org_id", org_id);

      if (dbError) {
        console.error(`[inngest:agent] Also failed to mark task ${task_id} as failed:`, dbError.message);
      }

      const ctx: OrgContext = { client: supabase, orgId: org_id };
      try {
        await refundByReference(ctx, task_id);
      } catch (refundErr) {
        console.error(`[inngest:agent] Credit refund failed for task ${task_id}:`, refundErr);
      }
    },
  },
  async ({ event, step }) => {
    const { task_id, org_id } = event.data;
    const supabase = createAdminClient();

    // Step 1: Load task + idempotency guard
    const task = await step.run("load-task", async () => {
      console.log("[inngest:agent] load-task", { taskId: task_id, orgId: org_id });
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      const t = await getTaskById(ctx, task_id);

      if (!t) throw new Error(`Task ${task_id} not found`);

      // Idempotency: only process tasks that are in_progress
      if (t.status !== "in_progress") {
        console.log(`[inngest:agent] Task ${task_id} already processed (status: ${t.status}) — skipping`);
        return null;
      }

      return t;
    });

    // Early exit if task was already processed
    if (!task) return { skipped: true, task_id };

    // Step 2: Load strategy context
    const strategyContext = await step.run("load-strategy", async () => {
      console.log("[inngest:agent] load-strategy", { taskId: task_id });
      const docTypes = relevantDocTypes(task.task_type);
      const { data: strategyDocs } = await supabase
        .from("mktg_strategy_docs")
        .select("doc_type, title, content")
        .eq("org_id", org_id)
        .eq("is_active", true)
        .in("doc_type", docTypes)
        .order("updated_at", { ascending: false });

      return (strategyDocs || [])
        .map((doc) => `## ${doc.title} (${doc.doc_type})\n${doc.content}`)
        .join("\n\n---\n\n");
    });

    // Step 3: Reserve credits
    const ledgerId = await step.run("reserve-credits", async () => {
      console.log("[inngest:agent] reserve-credits", { taskId: task_id, orgId: org_id });
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      return reserveCredits(ctx, 1, `agent-execution:${task_id}`, task_id);
    });

    // Step 4: Call Claude API
    const claudeResult = await step.run("call-claude", async () => {
      console.log("[inngest:agent] call-claude", { taskId: task_id });
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

      const systemPrompt = `You are a marketing automation assistant. Your job is to execute tasks based on the organization's strategy documents.

${strategyContext ? `Here is the organization's strategy context:\n\n${strategyContext}` : "No strategy documents are available."}

Generate content that aligns with the brand voice and strategic goals described above. Be specific, actionable, and ready for human review.`;

      const userPrompt = `Execute this task and generate the content:

<task-description>
Title: ${task.title}
Type: ${task.task_type}
Priority: ${task.priority}
Description: ${task.description || "No additional description provided."}
</task-description>

Please generate the complete content for this task. Format it clearly so a human reviewer can approve, reject, or request revisions.`;

      const startTime = Date.now();
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const generatedContent = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n\n");

      return {
        content: generatedContent,
        model: response.model,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        duration_ms: Date.now() - startTime,
      };
    });

    // Step 5: Create approval entry + update task status
    await step.run("create-approval", async () => {
      console.log("[inngest:agent] create-approval", { taskId: task_id });

      const itemTypeMap: Record<string, string> = {
        create: "blog_post",
        outreach: "email_draft",
        review: "task_submission",
        action: "task_submission",
        analysis: "task_submission",
      };

      const { error: approvalError } = await supabase
        .from("dtn_approval_queue")
        .insert({
          org_id,
          department_id: task.department_id,
          item_type: itemTypeMap[task.task_type] || "task_submission",
          title: task.title,
          content: claudeResult.content,
          metadata: {
            model: claudeResult.model,
            input_tokens: claudeResult.input_tokens,
            output_tokens: claudeResult.output_tokens,
            duration_ms: claudeResult.duration_ms,
          },
          submitted_by_type: "claude_api",
          submitted_by_id: null,
          daily_task_id: task_id,
          status: "pending",
        });

      if (approvalError) throw approvalError;

      const { error: taskUpdateError } = await supabase
        .from("dtn_daily_tasks")
        .update({
          status: "waiting_approval",
          generation_context: {
            ...((task.generation_context as Record<string, unknown>) ?? {}),
            execution: {
              model: claudeResult.model,
              input_tokens: claudeResult.input_tokens,
              output_tokens: claudeResult.output_tokens,
              duration_ms: claudeResult.duration_ms,
              executed_at: new Date().toISOString(),
            },
          },
        })
        .eq("id", task_id)
        .eq("org_id", org_id);

      if (taskUpdateError) {
        // Throw so Inngest retries this step — otherwise the task stays in_progress
        // with an orphaned approval entry and no recovery path.
        throw new Error(`Task ${task_id} status update to waiting_approval failed: ${taskUpdateError.message}`);
      }
    });

    // Step 6: Confirm credits
    await step.run("confirm-credits", async () => {
      console.log("[inngest:agent] confirm-credits", { taskId: task_id, ledgerId });
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      await confirmCredits(ctx, ledgerId);
    });

    return { success: true, task_id, duration_ms: claudeResult.duration_ms };
  },
);
