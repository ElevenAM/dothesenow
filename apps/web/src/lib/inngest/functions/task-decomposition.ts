import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getOrgById,
  getStrategyDocs,
  reserveCredits,
  confirmCredits,
  refundByReference,
  bulkCreateTasks,
} from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import type { Industry, BudgetTier, CreateTaskInput, Priority, ExecutorType } from "@dothesenow/types";
import {
  assembleDecompositionPrompt,
  validateDecompositionOutput,
  buildDecompositionCorrectionPrompt,
  TASK_DECOMPOSITION_COST,
} from "@dothesenow/prompts";
import type {
  DecompositionContext,
  DecomposedTask,
  YesterdayOutcome,
  ChannelBalanceEntry,
  ExperimentProgressEntry,
  TeamMember,
  OrgProfile,
} from "@dothesenow/prompts";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6-20250514";
const MAX_TOKENS = 4096;

const PRIORITY_MAP: Record<number, Priority> = {
  1: "urgent",
  2: "high",
  3: "medium",
  4: "low",
  5: "low",
};

/**
 * Task decomposition — converts a GACCS strategy doc into today's prioritized task list.
 *
 * 7-step durable pipeline:
 * 1. Check day + duplicates (Sunday skip, idempotency guard)
 * 2. Load org, active strategy, team roster (cross-org guard)
 * 3. Load yesterday's outcomes, channel balance, experiment progress
 * 4. Reserve credits
 * 5. Call Claude API with decomposition prompt
 * 6. Validate output + retry once if invalid, then bulk insert tasks
 * 7. Confirm credits
 *
 * On failure: refund credits.
 */
export const taskDecomposition = inngest.createFunction(
  {
    id: "task-decomposition",
    triggers: [
      { event: "task/daily.generate" },
      { event: "task/decompose.manual" },
    ],
    concurrency: [{ limit: 5 }],
    rateLimit: { limit: 3, period: "1h", key: "event.data.org_id" },
    retries: 1,
    onFailure: async ({ event, error }) => {
      const orgId = (event.data.event.data as { org_id: string }).org_id;
      console.error(
        `[inngest:decompose] Failed for org ${orgId}:`,
        error.message,
      );

      const supabase = createAdminClient();
      const ctx: OrgContext = { client: supabase, orgId };

      // Refund any reserved credits for this decomposition
      try {
        const targetDate = await getTargetDate(supabase, orgId, event.data.event.data);
        await refundByReference(ctx, `decompose-${orgId}-${targetDate}`);
      } catch (refundErr) {
        console.error(`[inngest:decompose] Credit refund failed:`, refundErr);
      }
    },
  },
  async ({ event, step }) => {
    const { org_id } = event.data;
    const supabase = createAdminClient();

    // Step 1: Check day-of-week + duplicate guard
    const { targetDate, dayOfWeek, shouldSkip } = await step.run(
      "check-day-and-duplicates",
      async () => {
        const org = await getOrgById(supabase, org_id);
        const tz = org?.timezone ?? "America/New_York";

        // Compute target date in org's timezone
        const now = new Date();
        const localDate =
          "target_date" in event.data && event.data.target_date
            ? (event.data.target_date as string)
            : now.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD

        const localDay = new Date(localDate + "T12:00:00").getDay();

        // Sunday: skip entirely
        if (localDay === 0) {
          return { targetDate: localDate, dayOfWeek: localDay, shouldSkip: true };
        }

        // Idempotency: check if tasks already generated for this date (cron trigger only)
        const isManual = event.name === "task/decompose.manual";
        if (!isManual) {
          const { data: existing } = await supabase
            .from("dtn_daily_tasks")
            .select("id")
            .eq("org_id", org_id)
            .eq("scheduled_date", localDate)
            .eq("generated_by", "claude")
            .limit(1);

          if (existing && existing.length > 0) {
            return { targetDate: localDate, dayOfWeek: localDay, shouldSkip: true };
          }
        }

        return { targetDate: localDate, dayOfWeek: localDay, shouldSkip: false };
      },
    );

    if (shouldSkip) {
      return { success: true, org_id, targetDate, skipped: true, reason: dayOfWeek === 0 ? "sunday" : "already_generated" };
    }

    // Step 2: Load org, active strategy, and team roster
    const context = await step.run("load-context", async () => {
      const org = await getOrgById(supabase, org_id);
      if (!org) throw new Error(`Organization ${org_id} not found`);
      if (!org.industry) throw new Error("Organization has no industry — complete onboarding first");
      if (!org.budget_tier) throw new Error("Organization has no budget tier — complete onboarding first");

      const ctx: OrgContext = { client: supabase, orgId: org_id };

      // Load active master_strategy doc
      const docs = await getStrategyDocs(ctx, {
        is_active: true,
        doc_type: "master_strategy",
      });
      if (docs.length === 0) {
        throw new Error("No active strategy document — generate a strategy first");
      }
      const strategyDoc = docs[0];

      // Cross-org guard: ensure strategy doc belongs to this org
      if (strategyDoc.org_id !== org_id) {
        throw new Error("Strategy document org mismatch — data integrity error");
      }

      // Load team with specialties
      const { data: memberships } = await supabase
        .from("dtn_memberships")
        .select("user_id, role, specialties, profiles:profiles!dtn_memberships_user_id_profiles_fkey(display_name, email)")
        .eq("org_id", org_id)
        .eq("is_active", true)
        .not("user_id", "is", null);

      const team: TeamMember[] = (memberships ?? []).map((m: Record<string, unknown>) => ({
        userId: m.user_id as string,
        displayName: (m.profiles as Record<string, unknown> | null)?.display_name as string | null,
        specialties: (m.specialties as string[]) ?? [],
        role: m.role as string,
      }));

      const orgProfile: OrgProfile & { teamSize: number; timezone: string | null } = {
        industry: org.industry as Industry,
        budgetTier: org.budget_tier as BudgetTier,
        stage: org.stage,
        growthMotion: org.growth_motion,
        name: org.name,
        teamSize: team.length || 1,
        timezone: org.timezone,
      };

      return {
        org: orgProfile,
        strategyDocId: strategyDoc.id,
        strategyContent: strategyDoc.content,
        team,
      };
    });

    // Step 3: Load yesterday's outcomes + channel balance + experiment progress
    const historyData = await step.run("load-yesterday", async () => {
      const yesterday = new Date(targetDate + "T12:00:00");
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      // Yesterday's tasks
      const { data: yesterdayTasks } = await supabase
        .from("dtn_daily_tasks")
        .select("id, title, status, executor_type, strategy_section_ref, experiment_id")
        .eq("org_id", org_id)
        .eq("scheduled_date", yesterdayStr);

      const yesterdayOutcomes: YesterdayOutcome[] = (yesterdayTasks ?? []).map(
        (t: Record<string, unknown>) => ({
          taskId: t.id as string,
          title: t.title as string,
          status: t.status as string,
          executorType: t.executor_type as string,
          strategySection: t.strategy_section_ref as string | null,
          experimentId: t.experiment_id as string | null,
        }),
      );

      // Channel balance: count tasks per channel over last 5 days
      const fiveDaysAgo = new Date(targetDate + "T12:00:00");
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const fiveDaysAgoStr = fiveDaysAgo.toISOString().split("T")[0];

      const { data: recentTasks } = await supabase
        .from("dtn_daily_tasks")
        .select("strategy_section_ref")
        .eq("org_id", org_id)
        .gte("scheduled_date", fiveDaysAgoStr)
        .lt("scheduled_date", targetDate)
        .not("strategy_section_ref", "is", null);

      // Simple channel balance from section refs
      const channelCounts: Record<string, number> = {};
      let totalSectionTasks = 0;
      for (const t of recentTasks ?? []) {
        const ref = (t as Record<string, unknown>).strategy_section_ref as string;
        if (ref.startsWith("Channels.")) {
          const channel = ref.replace("Channels.", "");
          channelCounts[channel] = (channelCounts[channel] ?? 0) + 1;
          totalSectionTasks++;
        }
      }

      const channelBalance: ChannelBalanceEntry[] = Object.entries(
        channelCounts,
      ).map(([channel, count]) => ({
        channel,
        targetPct: 0, // Will be enriched from strategy content in prompt assembly
        actualPct: totalSectionTasks > 0 ? Math.round((count / totalSectionTasks) * 100) : 0,
      }));

      // Experiment progress: count completed steps per experiment (last 30 days)
      const thirtyDaysAgo = new Date(targetDate + "T12:00:00");
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

      const { data: experimentTasks } = await supabase
        .from("dtn_daily_tasks")
        .select("experiment_id, status")
        .eq("org_id", org_id)
        .not("experiment_id", "is", null)
        .gte("scheduled_date", thirtyDaysAgoStr);

      const expProgress: Record<string, { completed: number; total: number }> =
        {};
      for (const t of experimentTasks ?? []) {
        const eid = (t as Record<string, unknown>).experiment_id as string;
        if (!expProgress[eid]) expProgress[eid] = { completed: 0, total: 0 };
        expProgress[eid].total++;
        if ((t as Record<string, unknown>).status === "completed") {
          expProgress[eid].completed++;
        }
      }

      const experimentProgress: ExperimentProgressEntry[] = Object.entries(
        expProgress,
      ).map(([experimentId, p]) => ({
        experimentId,
        experimentTitle: experimentId, // Title will come from strategy content
        completedSteps: p.completed,
        totalEstimatedSteps: p.total,
      }));

      return { yesterdayOutcomes, channelBalance, experimentProgress };
    });

    // Step 4: Reserve credits
    const ledgerId = await step.run("reserve-credits", async () => {
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      return reserveCredits(
        ctx,
        TASK_DECOMPOSITION_COST,
        `task-decomposition:${targetDate}`,
        `decompose-${org_id}-${targetDate}`,
      );
    });

    // Step 5: Call Claude API
    const claudeResult = await step.run("call-claude", async () => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

      const decompositionCtx: DecompositionContext = {
        org: context.org,
        strategyDocId: context.strategyDocId,
        strategyContent: context.strategyContent,
        yesterdayOutcomes: historyData.yesterdayOutcomes,
        channelBalance: historyData.channelBalance,
        experimentProgress: historyData.experimentProgress,
        team: context.team,
        targetDate,
        dayOfWeek,
      };

      const { systemPrompt, userPrompt } = assembleDecompositionPrompt(decompositionCtx);

      const startTime = Date.now();
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const rawOutput = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n\n");

      return {
        rawOutput,
        systemPrompt,
        userPrompt,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        durationMs: Date.now() - startTime,
      };
    });

    // Step 6: Validate output + save tasks (retry once if invalid)
    const saveResult = await step.run("validate-and-save", async () => {
      const budgetTier = context.org.budgetTier;
      let validation = validateDecompositionOutput(
        claudeResult.rawOutput,
        budgetTier,
        context.org.teamSize,
        dayOfWeek,
      );
      let retryCount = 0;
      let finalTasks = validation.tasks;

      // One retry with correction prompt if validation fails
      if (!validation.valid) {
        console.warn(
          "[inngest:decompose] Validation failed, retrying:",
          validation.errors,
        );
        retryCount = 1;

        const correctionPrompt = buildDecompositionCorrectionPrompt(
          claudeResult.rawOutput,
          validation.errors,
        );

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

        const anthropic = new Anthropic({ apiKey });
        const retryResponse = await anthropic.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: claudeResult.systemPrompt,
          messages: [
            { role: "user", content: claudeResult.userPrompt },
            { role: "assistant", content: claudeResult.rawOutput },
            { role: "user", content: correctionPrompt },
          ],
        });

        const retryOutput = retryResponse.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n\n");

        validation = validateDecompositionOutput(
          retryOutput,
          budgetTier,
          context.org.teamSize,
          dayOfWeek,
        );
        finalTasks = validation.tasks;
      }

      // Map DecomposedTask[] to CreateTaskInput[]
      const taskInputs: (CreateTaskInput & { created_by?: string; assigned_to?: string })[] =
        finalTasks.map((t: DecomposedTask) => {
          // Match recommended_assignee_role to a real team member
          let assignedTo: string | null = null;
          if (t.recommended_assignee_role && context.team.length > 1) {
            const matches = context.team.filter((m) =>
              m.specialties.includes(t.recommended_assignee_role!),
            );
            if (matches.length === 1) {
              assignedTo = matches[0].userId;
            }
            // If 0 or multiple matches, leave unassigned for team lead to decide
          } else if (context.team.length === 1 && context.team[0]) {
            // Solo founder: assign to self
            assignedTo = context.team[0].userId;
          }

          return {
            title: t.title,
            description: t.description,
            duration_minutes: t.duration_minutes,
            priority: PRIORITY_MAP[t.priority] ?? "medium",
            executor_type: (t.executor_type === "byos" ? "self" : t.executor_type) as ExecutorType,
            strategy_doc_id: context.strategyDocId,
            strategy_section_ref: t.strategy_section_ref,
            experiment_id: t.experiment_id ?? undefined,
            recommended_assignee_role: t.recommended_assignee_role ?? undefined,
            scheduled_date: targetDate,
            generated_by: "claude",
            generation_context: {
              decomposition_date: targetDate,
              model: claudeResult.model,
              input_tokens: claudeResult.inputTokens,
              output_tokens: claudeResult.outputTokens,
              duration_ms: claudeResult.durationMs,
              retry_count: retryCount,
              validation_errors: validation.valid ? [] : validation.errors,
            },
            ...(assignedTo ? { assigned_to: assignedTo } : {}),
          } satisfies CreateTaskInput & { assigned_to?: string };
        });

      // Bulk insert
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      const created = await bulkCreateTasks(ctx, taskInputs);

      return {
        taskCount: created.length,
        retryCount,
        valid: validation.valid,
        validationErrors: validation.valid ? [] : validation.errors,
      };
    });

    // Step 7: Confirm credits
    await step.run("confirm-credits", async () => {
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      await confirmCredits(ctx, ledgerId);
    });

    return {
      success: true,
      org_id,
      targetDate,
      taskCount: saveResult.taskCount,
      retryCount: saveResult.retryCount,
      durationMs: claudeResult.durationMs,
    };
  },
);

/** Helper to compute target date for refund in onFailure handler. */
async function getTargetDate(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  eventData: Record<string, unknown>,
): Promise<string> {
  if (eventData.target_date) return eventData.target_date as string;
  const org = await getOrgById(supabase, orgId);
  const tz = org?.timezone ?? "America/New_York";
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}
