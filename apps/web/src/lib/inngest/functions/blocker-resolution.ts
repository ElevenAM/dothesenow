import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getTaskById,
  getBlockerById,
  updateBlocker,
  transitionTaskStatus,
  getStrategyDocs,
  reserveCredits,
  confirmCredits,
  refundByReference,
  createApproval,
} from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import {
  BLOCKER_ROUTING,
  BlockerRoute,
  type BlockerType,
  type BlockerResolutionStatus,
} from "@dothesenow/types";
import {
  assembleClassifierPrompt,
  validateClassifierResult,
  buildClassifierCorrectionPrompt,
  assembleResearchPrompt,
  validateResearchResult,
  buildResearchCorrectionPrompt,
  assembleDraftPrompt,
  validateDraftResult,
  buildDraftCorrectionPrompt,
  BLOCKER_CLASSIFICATION_COST,
  BLOCKER_RESEARCH_COST,
  BLOCKER_DRAFT_COST,
} from "@dothesenow/prompts";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const CLASSIFIER_MAX_TOKENS = 1024;
const AGENT_MAX_TOKENS = 4096;

// ─── Helper: call Claude and extract text ───────────────────────

async function callClaude(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  maxTokens: number,
): Promise<{ text: string; model: string; inputTokens: number; outputTokens: number; durationMs: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const startTime = Date.now();
  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");

  return {
    text,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. BLOCKER CLASSIFICATION
// ═══════════════════════════════════════════════════════════════

export const blockerClassification = inngest.createFunction(
  {
    id: "blocker-classification",
    triggers: [{ event: "blocker/reported" }],
    concurrency: [{ limit: 5 }],
    rateLimit: { limit: 10, period: "1h", key: "event.data.org_id" },
    idempotency: "event.data.blocker_id",
    retries: 1,
    onFailure: async ({ event, error }) => {
      const { org_id, blocker_id } = event.data.event.data as {
        org_id: string;
        blocker_id: string;
      };
      console.error(
        `[inngest:blocker-classify] Failed for blocker ${blocker_id}:`,
        error.message,
      );

      const supabase = createAdminClient();
      const ctx: OrgContext = { client: supabase, orgId: org_id };

      // Reset blocker to reported so it can be retried
      try {
        await updateBlocker(ctx, blocker_id, { resolution_status: "reported" as BlockerResolutionStatus });
      } catch (e) {
        console.error(`[inngest:blocker-classify] Failed to reset blocker ${blocker_id}:`, e);
      }

      // Refund any reserved credits
      try {
        await refundByReference(ctx, blocker_id);
      } catch (e) {
        console.error(`[inngest:blocker-classify] Credit refund failed for ${blocker_id}:`, e);
      }
    },
  },
  async ({ event, step }) => {
    const { blocker_id, task_id, org_id } = event.data;
    const supabase = createAdminClient();
    const ctx: OrgContext = { client: supabase, orgId: org_id };

    // Step 1: Load blocker + task, update status to classifying
    const { task, blocker } = await step.run("load-context", async () => {
      const [blockerRecord, taskRecord] = await Promise.all([
        getBlockerById(ctx, blocker_id),
        getTaskById(ctx, task_id),
      ]);

      if (!blockerRecord) throw new Error(`Blocker ${blocker_id} not found`);
      if (!taskRecord) throw new Error(`Task ${task_id} not found`);

      await updateBlocker(ctx, blocker_id, {
        resolution_status: "classifying" as BlockerResolutionStatus,
      });

      return { task: taskRecord, blocker: blockerRecord };
    });

    // Step 2: Reserve credits
    const ledgerId = await step.run("reserve-credits", async () => {
      return reserveCredits(
        ctx,
        BLOCKER_CLASSIFICATION_COST,
        `blocker-classify:${blocker_id}`,
        blocker_id,
      );
    });

    // Step 3: Call Claude classifier with validation + one retry
    const classification = await step.run("call-classifier", async () => {
      const { systemPrompt, userPrompt } = assembleClassifierPrompt(
        task.title,
        task.description ?? "",
        blocker.description,
      );

      const result = await callClaude(
        systemPrompt,
        [{ role: "user", content: userPrompt }],
        CLASSIFIER_MAX_TOKENS,
      );

      let validation = validateClassifierResult(result.text);

      // One retry with correction if invalid
      if (!validation.valid) {
        console.warn(
          "[inngest:blocker-classify] Validation failed, retrying:",
          validation.errors,
        );

        const correctionPrompt = buildClassifierCorrectionPrompt(
          result.text,
          validation.errors,
        );

        const retryResult = await callClaude(
          systemPrompt,
          [
            { role: "user", content: userPrompt },
            { role: "assistant", content: result.text },
            { role: "user", content: correctionPrompt },
          ],
          CLASSIFIER_MAX_TOKENS,
        );

        validation = validateClassifierResult(retryResult.text);
        if (!validation.valid) {
          throw new Error(
            `Classification validation failed after retry: ${validation.errors.join("; ")}`,
          );
        }

        return {
          ...validation.result!,
          metadata: {
            model: retryResult.model,
            inputTokens: result.inputTokens + retryResult.inputTokens,
            outputTokens: result.outputTokens + retryResult.outputTokens,
            durationMs: result.durationMs + retryResult.durationMs,
            retryCount: 1,
          },
        };
      }

      return {
        ...validation.result!,
        metadata: {
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          durationMs: result.durationMs,
          retryCount: 0,
        },
      };
    });

    // Step 4: Save classification + transition task to blocked
    await step.run("save-classification", async () => {
      await updateBlocker(ctx, blocker_id, {
        blocker_type: classification.blocker_type,
        blocker_type_secondary: classification.blocker_type_secondary,
        classification_confidence: classification.confidence,
        classification_reasoning: classification.reasoning,
        resolution_status: "classified" as BlockerResolutionStatus,
        resolution_metadata: classification.metadata,
      });

      // Transition task to blocked via state machine RPC
      await transitionTaskStatus(ctx, task_id, "blocked", "agent", null, {
        blocker_id,
        blocker_type: classification.blocker_type,
      });
    });

    // Step 5: Confirm credits + send downstream events
    await step.run("confirm-and-route", async () => {
      await confirmCredits(ctx, ledgerId);

      const route = BLOCKER_ROUTING[classification.blocker_type as BlockerType];

      // Send classified event for the resolver
      await inngest.send({
        name: "blocker/classified",
        data: {
          blocker_id,
          task_id,
          org_id,
          blocker_type: classification.blocker_type,
          route,
        },
      });

      // Send escalation check for dependency blockers (or all — escalation will exit early for resolved)
      await inngest.send({
        name: "blocker/escalation.check",
        data: { blocker_id, task_id, org_id, current_level: 0 },
      });
    });

    return {
      success: true,
      blocker_id,
      blocker_type: classification.blocker_type,
      route: BLOCKER_ROUTING[classification.blocker_type as BlockerType],
    };
  },
);

// ═══════════════════════════════════════════════════════════════
// 2. BLOCKER RESOLVER
// ═══════════════════════════════════════════════════════════════

export const blockerResolver = inngest.createFunction(
  {
    id: "blocker-resolver",
    triggers: [{ event: "blocker/classified" }],
    concurrency: [{ limit: 3 }],
    rateLimit: { limit: 5, period: "1h", key: "event.data.org_id" },
    retries: 1,
    onFailure: async ({ event, error }) => {
      const { org_id, blocker_id } = event.data.event.data as {
        org_id: string;
        blocker_id: string;
      };
      console.error(
        `[inngest:blocker-resolve] Failed for blocker ${blocker_id}:`,
        error.message,
      );

      const supabase = createAdminClient();
      const ctx: OrgContext = { client: supabase, orgId: org_id };

      try {
        await updateBlocker(ctx, blocker_id, {
          resolution_status: "classified" as BlockerResolutionStatus,
        });
      } catch (e) {
        console.error(`[inngest:blocker-resolve] Failed to reset blocker ${blocker_id}:`, e);
      }

      try {
        await refundByReference(ctx, blocker_id);
      } catch (e) {
        console.error(`[inngest:blocker-resolve] Credit refund failed for ${blocker_id}:`, e);
      }
    },
  },
  async ({ event, step }) => {
    const { blocker_id, task_id, org_id, route } = event.data;
    const supabase = createAdminClient();
    const ctx: OrgContext = { client: supabase, orgId: org_id };

    // Step 1: Load context
    const context = await step.run("load-context", async () => {
      const [blockerRecord, taskRecord] = await Promise.all([
        getBlockerById(ctx, blocker_id),
        getTaskById(ctx, task_id),
      ]);

      if (!blockerRecord) throw new Error(`Blocker ${blocker_id} not found`);
      if (!taskRecord) throw new Error(`Task ${task_id} not found`);

      // Check if already resolved (race condition guard)
      if (["resolved", "dismissed"].includes(blockerRecord.resolution_status)) {
        return { blocker: blockerRecord, task: taskRecord, strategyContent: null, alreadyResolved: true };
      }

      // Load strategy context for LLM routes
      let strategyContent: string | null = null;
      if (route === BlockerRoute.ResearchAgent || route === BlockerRoute.DraftAgent) {
        const docs = await getStrategyDocs(ctx, {
          is_active: true,
          doc_type: "master_strategy",
        });
        strategyContent = docs[0]?.content ?? null;
      }

      await updateBlocker(ctx, blocker_id, {
        resolution_status: "resolving" as BlockerResolutionStatus,
      });

      return { blocker: blockerRecord, task: taskRecord, strategyContent, alreadyResolved: false };
    });

    // Early exit if already resolved
    if (context.alreadyResolved) {
      return { success: true, blocker_id, route, skipped: true };
    }

    // Step 2: Reserve credits (0 for non-LLM routes)
    const creditCost =
      route === BlockerRoute.ResearchAgent ? BLOCKER_RESEARCH_COST
      : route === BlockerRoute.DraftAgent ? BLOCKER_DRAFT_COST
      : 0;

    const ledgerId = creditCost > 0
      ? await step.run("reserve-credits", async () => {
          return reserveCredits(
            ctx,
            creditCost,
            `blocker-resolve:${blocker_id}`,
            blocker_id,
          );
        })
      : null;

    // Step 3: Route-specific resolution
    const resolution = await step.run("resolve", async () => {
      const { blocker, task, strategyContent } = context;

      switch (route) {
        case BlockerRoute.ResearchAgent: {
          const { systemPrompt, userPrompt } = assembleResearchPrompt(
            task.title,
            task.description ?? "",
            blocker.description,
            strategyContent,
          );

          const result = await callClaude(
            systemPrompt,
            [{ role: "user", content: userPrompt }],
            AGENT_MAX_TOKENS,
          );

          let validation = validateResearchResult(result.text);

          if (!validation.valid) {
            const correction = buildResearchCorrectionPrompt(result.text, validation.errors);
            const retry = await callClaude(
              systemPrompt,
              [
                { role: "user", content: userPrompt },
                { role: "assistant", content: result.text },
                { role: "user", content: correction },
              ],
              AGENT_MAX_TOKENS,
            );
            validation = validateResearchResult(retry.text);
            if (!validation.valid) {
              throw new Error(`Research validation failed after retry: ${validation.errors.join("; ")}`);
            }
            return { output: JSON.stringify(validation.result), status: "resolved" as const };
          }

          return { output: JSON.stringify(validation.result), status: "resolved" as const };
        }

        case BlockerRoute.DraftAgent: {
          const { systemPrompt, userPrompt } = assembleDraftPrompt(
            task.title,
            task.description ?? "",
            blocker.description,
            strategyContent,
          );

          const result = await callClaude(
            systemPrompt,
            [{ role: "user", content: userPrompt }],
            AGENT_MAX_TOKENS,
          );

          let validation = validateDraftResult(result.text);

          if (!validation.valid) {
            const correction = buildDraftCorrectionPrompt(result.text, validation.errors);
            const retry = await callClaude(
              systemPrompt,
              [
                { role: "user", content: userPrompt },
                { role: "assistant", content: result.text },
                { role: "user", content: correction },
              ],
              AGENT_MAX_TOKENS,
            );
            validation = validateDraftResult(retry.text);
            if (!validation.valid) {
              throw new Error(`Draft validation failed after retry: ${validation.errors.join("; ")}`);
            }
            return { output: JSON.stringify(validation.result), status: "resolved" as const };
          }

          return { output: JSON.stringify(validation.result), status: "resolved" as const };
        }

        case BlockerRoute.Escalation: {
          return {
            output: `Dependency blocker escalated. Waiting for external resolution.`,
            status: "escalated" as const,
          };
        }

        case BlockerRoute.Replan: {
          const suggestion = `Resource constraint detected: "${blocker.description}". Consider: (1) reduce task scope, (2) defer to a later date, (3) allocate additional resources, or (4) substitute a cheaper channel/tool.`;
          return { output: suggestion, status: "resolved" as const };
        }

        case BlockerRoute.ApprovalQueue: {
          await createApproval(ctx, {
            item_type: "blocker_decision",
            title: `Decision needed: ${task.title}`,
            content: `A task is blocked and needs a strategic decision.\n\nTask: ${task.title}\n${task.description ? `Description: ${task.description}\n` : ""}\nBlocker: ${blocker.description}\n\nClassification: ${blocker.blocker_type} (confidence: ${blocker.classification_confidence})\nReasoning: ${blocker.classification_reasoning}`,
            submitted_by_type: "claude_api",
            daily_task_id: task.id,
            metadata: {
              blocker_id: blocker.id,
              blocker_type: blocker.blocker_type,
            },
          });
          return {
            output: "Decision surfaced to org owner via approval queue.",
            status: "resolving" as const,
          };
        }

        default:
          throw new Error(`Unknown route: ${route}`);
      }
    });

    // Step 4: Save resolution output
    await step.run("save-result", async () => {
      await updateBlocker(ctx, blocker_id, {
        resolution_status: resolution.status as BlockerResolutionStatus,
        resolution_output: resolution.output,
        ...(resolution.status === "resolved" ? { resolved_at: new Date().toISOString() } : {}),
        ...(route === BlockerRoute.Escalation ? { escalation_level: 1, last_escalated_at: new Date().toISOString() } : {}),
      });
    });

    // Step 5: Confirm credits
    if (ledgerId) {
      await step.run("confirm-credits", async () => {
        await confirmCredits(ctx, ledgerId);
      });
    }

    return { success: true, blocker_id, route, status: resolution.status };
  },
);

// ═══════════════════════════════════════════════════════════════
// 3. BLOCKER ESCALATION (self-chaining, max 24h per invocation)
// ═══════════════════════════════════════════════════════════════

export const blockerEscalation = inngest.createFunction(
  {
    id: "blocker-escalation",
    triggers: [{ event: "blocker/escalation.check" }],
    concurrency: [{ limit: 5 }],
    // Idempotency: blocker_id + level prevents duplicate escalation at same level
    idempotency: "event.data.blocker_id + '-' + string(event.data.current_level)",
    retries: 0,
  },
  async ({ event, step }) => {
    const { blocker_id, task_id, org_id, current_level } = event.data;
    const supabase = createAdminClient();
    const ctx: OrgContext = { client: supabase, orgId: org_id };

    // Step 1: Check if blocker is still unresolved
    const shouldEscalate = await step.run("check-status", async () => {
      const blocker = await getBlockerById(ctx, blocker_id);
      if (!blocker) return false;
      if (["resolved", "dismissed"].includes(blocker.resolution_status)) return false;
      if (blocker.escalation_level >= 3) return false;
      return true;
    });

    if (!shouldEscalate) {
      return { blocker_id, escalated: false, reason: "already resolved or max level" };
    }

    // Step 2: Sleep 24 hours
    await step.sleep("wait-escalation", "24h");

    // Step 3: Re-check after sleep (blocker may have been resolved manually)
    const nextLevel = await step.run("escalate", async () => {
      const blocker = await getBlockerById(ctx, blocker_id);
      if (!blocker) return null;
      if (["resolved", "dismissed"].includes(blocker.resolution_status)) return null;

      const newLevel = current_level + 1;

      await updateBlocker(ctx, blocker_id, {
        escalation_level: newLevel,
        last_escalated_at: new Date().toISOString(),
        resolution_status: "escalated" as BlockerResolutionStatus,
      });

      // Log escalation in task events
      await transitionTaskStatus(ctx, task_id, "blocked", "agent", null, {
        blocker_id,
        escalation_level: newLevel,
        escalation_action: `Escalated to level ${newLevel} (${newLevel * 24}h)`,
      });

      return newLevel;
    });

    if (nextLevel === null) {
      return { blocker_id, escalated: false, reason: "resolved during sleep" };
    }

    // Step 4: Self-chain for next level if not at max
    if (nextLevel < 3) {
      await step.run("chain-next", async () => {
        await inngest.send({
          name: "blocker/escalation.check",
          data: { blocker_id, task_id, org_id, current_level: nextLevel },
        });
      });
    }

    return { blocker_id, escalated: true, level: nextLevel };
  },
);
