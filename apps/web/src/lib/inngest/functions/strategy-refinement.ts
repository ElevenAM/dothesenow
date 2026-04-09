import { inngest } from "../client";
import { filterOrgsByLocalHour, localDateString } from "../utils";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActiveOrgs,
  getOrgById,
  getCreditBalance,
  reserveCredits,
  confirmCredits,
  refundByReference,
  getStrategyDocs,
  getChannelPerformance,
  getExperimentsForOrg,
  getAllExperimentResultsForOrg,
  createApproval,
  getMetricsSummary,
} from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import type { Industry, BudgetTier, ExperimentResult } from "@dothesenow/types";
import {
  assembleRefinerPrompt,
  validateRefinerOutput,
  buildRefinerCorrectionPrompt,
  getIndustryBenchmarks,
  STRATEGY_REFINEMENT_COST,
} from "@dothesenow/prompts";
import type {
  OrgProfile,
  PerformanceData,
  ChannelPerformanceWithGaps,
  ExperimentOutcome,
  ExperimentProgressEntry,
  RedFlag,
} from "@dothesenow/prompts";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6-20250514";
const MAX_TOKENS = 4096;
const REFINEMENT_TABLE = "dtn_refinement_runs";

// ─── Cron helpers ──────────────────────────────────────────────

function localDayOfWeek(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    });
    const parts = formatter.formatToParts(new Date());
    const dayPart = parts.find((p) => p.type === "weekday");
    if (!dayPart) return -1;
    const dayMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    return dayMap[dayPart.value] ?? -1;
  } catch {
    return -1;
  }
}

// ─── Data aggregation helpers ──────────────────────────────────

function computeConsecutiveZeroDays(
  tasksByChannelDate: Map<string, Map<string, number>>,
  channels: string[],
  periodStart: string,
  periodEnd: string,
): Map<string, { daysActive: number; consecutiveZero: number }> {
  const result = new Map<string, { daysActive: number; consecutiveZero: number }>();

  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  for (const channel of channels) {
    const channelDates = tasksByChannelDate.get(channel) ?? new Map();
    let daysActive = 0;
    let maxConsecutiveZero = 0;
    let currentZeroStreak = 0;

    for (let d = 0; d < totalDays; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + d);
      const dateStr = date.toISOString().split("T")[0];
      const completedCount = channelDates.get(dateStr) ?? 0;

      if (completedCount > 0) {
        daysActive++;
        currentZeroStreak = 0;
      } else {
        currentZeroStreak++;
        maxConsecutiveZero = Math.max(maxConsecutiveZero, currentZeroStreak);
      }
    }

    result.set(channel, { daysActive, consecutiveZero: maxConsecutiveZero });
  }

  return result;
}

function buildExperimentOutcomes(
  experiments: { id: string; title: string; status: string; success_target: number | null; baseline_value: number | null }[],
  resultsByExperiment: Map<string, ExperimentResult[]>,
): { outcomes: ExperimentOutcome[]; inProgress: ExperimentProgressEntry[] } {
  const outcomes: ExperimentOutcome[] = [];
  const inProgress: ExperimentProgressEntry[] = [];

  for (const exp of experiments) {
    const results = resultsByExperiment.get(exp.id) ?? [];

    if (exp.status === "running") {
      inProgress.push({
        experimentId: exp.id,
        experimentTitle: exp.title,
        completedSteps: results.length,
        totalEstimatedSteps: Math.max(results.length, 4),
      });
    } else {
      const latestValue = results[0]?.metric_value ?? null;
      let result: ExperimentOutcome["result"] = "inconclusive";

      if (exp.status === "won") result = "success";
      else if (exp.status === "lost") result = "failure";
      else if (exp.status === "running") result = "running";

      outcomes.push({
        experiment_id: exp.id,
        title: exp.title,
        status: exp.status,
        result,
        metric_value: latestValue,
        baseline_value: exp.baseline_value,
        success_target: exp.success_target,
        data_points: results.length,
      });
    }
  }

  return { outcomes, inProgress };
}

function detectRedFlags(
  channelGaps: Map<string, { daysActive: number; consecutiveZero: number }>,
  channelData: ChannelPerformanceWithGaps[],
  experiments: { id: string; title: string; status: string; created_at: string }[],
): RedFlag[] {
  const flags: RedFlag[] = [];

  // Zero tasks in channel for 10+ consecutive days
  for (const ch of channelData) {
    const gaps = channelGaps.get(ch.strategy_section_ref);
    if (gaps && gaps.consecutiveZero >= 10) {
      flags.push({
        type: "zero_activity",
        channel_or_experiment: ch.strategy_section_ref,
        detail: `No completed tasks for ${gaps.consecutiveZero} consecutive days`,
        days: gaps.consecutiveZero,
      });
    }
  }

  // 100% task failure over 5+ tasks
  for (const ch of channelData) {
    if (ch.total_tasks >= 5 && ch.completed === 0) {
      flags.push({
        type: "total_failure",
        channel_or_experiment: ch.strategy_section_ref,
        detail: `0/${ch.total_tasks} tasks completed (100% failure)`,
        days: ch.total_tasks,
      });
    }
  }

  // Experiment stuck in backlog 20+ days
  const now = Date.now();
  for (const exp of experiments) {
    if (exp.status === "backlog") {
      const createdAt = new Date(exp.created_at).getTime();
      const daysInBacklog = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
      if (daysInBacklog >= 20) {
        flags.push({
          type: "experiment_stuck",
          channel_or_experiment: exp.title,
          detail: `In backlog for ${daysInBacklog} days with no progress`,
          days: daysInBacklog,
        });
      }
    }
  }

  return flags;
}

// ─── Threshold check ───────────────────────────────────────────

function meetsMinimumThresholds(
  budgetTier: string,
  totalTasks: number,
  daysOfData: number,
): boolean {
  if (budgetTier === "bootstrap") return totalTasks >= 8 && daysOfData >= 14;
  if (budgetTier === "growth") return totalTasks >= 15 && daysOfData >= 20;
  return totalTasks >= 25 && daysOfData >= 25; // scale
}

// ─── Update run record helper ──────────────────────────────────

async function updateRunRecord(
  supabase: ReturnType<typeof createAdminClient>,
  runId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from(REFINEMENT_TABLE)
    .update(updates)
    .eq("id", runId);

  if (error) {
    console.warn(
      `[inngest:refine] Run record update failed for ${runId}:`,
      error.message,
    );
  }
}

// CAC benchmarks are loaded from the prompts package (getIndustryBenchmarks)
// which uses the same CAC_DATA constant as the bullseye framework.
// No fs.readFileSync — safe for Vercel serverless.

// ─── Cron function: Weekly fan-out ─────────────────────────────

/**
 * Weekly refinement cron — runs hourly, filters for Monday 9am local time.
 * Checks each qualifying org for active strategy + sufficient credits,
 * then fans out strategy/refine events.
 */
export const strategyRefinementCron = inngest.createFunction(
  { id: "strategy-refinement-cron", triggers: [{ cron: "0 * * * *" }] },
  async ({ step }) => {
    const supabase = createAdminClient();

    const orgs = await step.run("get-monday-9am-orgs", async () => {
      const allOrgs = await getActiveOrgs(supabase);
      const at9am = filterOrgsByLocalHour(allOrgs, 9);

      // Filter to Monday only
      return at9am.filter((org) => {
        const tz = org.timezone ?? "America/New_York";
        return localDayOfWeek(tz) === 1; // Monday
      });
    });

    if (orgs.length === 0) {
      return { processed: 0 };
    }

    console.log(
      `[inngest:refine-cron] ${orgs.length} orgs at Monday 9am local`,
    );

    const events: {
      name: "strategy/refine";
      data: { org_id: string; triggered_by: string; refinement_id: string };
    }[] = [];

    for (const org of orgs) {
      await step.run(`preflight-${org.id}`, async () => {
        const ctx: OrgContext = { client: supabase, orgId: org.id };

        // Check credit balance
        const { remaining } = await getCreditBalance(ctx);
        if (remaining < STRATEGY_REFINEMENT_COST) {
          console.log(
            `[inngest:refine-cron] Org ${org.id} insufficient credits — skipping`,
          );
          return;
        }

        // Check active master_strategy exists
        const docs = await getStrategyDocs(ctx, {
          is_active: true,
          doc_type: "master_strategy",
        });
        if (docs.length === 0) {
          console.log(
            `[inngest:refine-cron] Org ${org.id} no active strategy — skipping`,
          );
          return;
        }

        const dateStr = localDateString(org.timezone ?? "America/New_York");
        events.push({
          name: "strategy/refine",
          data: {
            org_id: org.id,
            triggered_by: "cron",
            refinement_id: `weekly-${org.id}-${dateStr}`,
          },
        });
      });
    }

    if (events.length > 0) {
      await step.sendEvent("fan-out-refinement", events);
    }

    return { processed: events.length };
  },
);

// ─── Main refinement function ──────────────────────────────────

/**
 * Strategy refinement — 9-step durable pipeline.
 *
 * Steps:
 * 1. Create run record (idempotency via unique constraint)
 * 2+3. Load context (strategy + org + channel perf + experiments — parallelized)
 * 3. Check data thresholds (skip if insufficient)
 * 4. Build prompt
 * 5. Reserve credits
 * 6. Call Claude API
 * 7. Validate suggestions + retry with correction if needed
 * 8. Create approval item + update run record
 * 9. Confirm credits
 */
export const strategyRefinement = inngest.createFunction(
  {
    id: "strategy-refinement",
    triggers: [{ event: "strategy/refine" }],
    concurrency: [{ limit: 3 }],
    rateLimit: { limit: 1, period: "24h", key: "event.data.org_id" },
    idempotency: "event.data.refinement_id",
    retries: 1,
    onFailure: async ({ event, error }) => {
      const innerData = event.data?.event?.data as Record<string, unknown> | undefined;
      const org_id = typeof innerData?.org_id === "string" ? innerData.org_id : null;
      const refinement_id = typeof innerData?.refinement_id === "string" ? innerData.refinement_id : null;

      if (!org_id || !refinement_id) {
        console.error("[inngest:refine] onFailure: could not extract org_id/refinement_id from event");
        return;
      }

      console.error(
        `[inngest:refine] Failed for org ${org_id}:`,
        error.message,
      );

      const supabase = createAdminClient();

      // Update run record to failed — best-effort
      const { error: updateErr } = await supabase
        .from(REFINEMENT_TABLE)
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
        })
        .eq("org_id", org_id)
        .eq("run_id", refinement_id)
        .eq("status", "running");

      if (updateErr) {
        console.error(
          `[inngest:refine] Failed to update run record:`,
          updateErr.message,
        );
      }

      // Refund credits
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      try {
        await refundByReference(ctx, refinement_id);
      } catch (refundErr) {
        console.error(
          `[inngest:refine] Credit refund failed for ${refinement_id}:`,
          refundErr,
        );
      }
    },
  },
  async ({ event, step }) => {
    const { org_id, refinement_id } = event.data;
    const supabase = createAdminClient();
    const ctx: OrgContext = { client: supabase, orgId: org_id };

    // Step 1: Create run record
    const runRecordId = await step.run("create-run-record", async () => {
      // Fetch the active master_strategy to get its ID for the FK
      const docs = await getStrategyDocs(ctx, {
        is_active: true,
        doc_type: "master_strategy",
      });
      if (docs.length === 0) throw new Error("No active master_strategy found");

      const { data, error } = await supabase
        .from(REFINEMENT_TABLE)
        .insert({
          org_id,
          strategy_doc_id: docs[0].id,
          run_id: refinement_id,
          status: "running",
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) throw new Error(`Failed to create run record: ${error.message}`);
      return data.id as string;
    });

    // Step 2+3 (merged): Load all context in parallel
    const context = await step.run("load-context", async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const periodStart = thirtyDaysAgo.toISOString().split("T")[0];
      const periodEnd = new Date().toISOString().split("T")[0];

      const [
        orgRecord,
        strategyDocs,
        channelPerf,
        allExperiments,
        allResults,
        externalMetricsSummary,
      ] = await Promise.all([
        getOrgById(supabase, org_id),
        getStrategyDocs(ctx, { is_active: true, doc_type: "master_strategy" }),
        getChannelPerformance(ctx, periodStart, periodEnd),
        getExperimentsForOrg(ctx),
        getAllExperimentResultsForOrg(ctx, { since: thirtyDaysAgo.toISOString() }),
        getMetricsSummary(ctx, { periodStart, periodEnd }),
      ]);

      if (!orgRecord) throw new Error(`Organization ${org_id} not found`);
      if (strategyDocs.length === 0) throw new Error("No active master_strategy");

      const strategyDoc = strategyDocs[0];

      // Group experiment results by experiment_id
      const resultsByExperiment = new Map<string, ExperimentResult[]>();
      for (const r of allResults) {
        const existing = resultsByExperiment.get(r.experiment_id) ?? [];
        existing.push(r);
        resultsByExperiment.set(r.experiment_id, existing);
      }

      // Build experiment outcomes
      const { outcomes, inProgress } = buildExperimentOutcomes(
        allExperiments,
        resultsByExperiment,
      );

      // Consecutive zero-day detection: query daily tasks grouped by channel + date
      const { data: dailyTaskRows } = await supabase
        .from("dtn_daily_tasks")
        .select("strategy_section_ref, scheduled_date, status")
        .eq("org_id", org_id)
        .gte("scheduled_date", periodStart)
        .lte("scheduled_date", periodEnd)
        .not("strategy_section_ref", "is", null)
        .is("deleted_at", null);

      // Build per-channel per-date completed count map
      const channelDateMap = new Map<string, Map<string, number>>();
      for (const row of dailyTaskRows ?? []) {
        const ch = row.strategy_section_ref as string;
        const date = row.scheduled_date as string;
        if (!channelDateMap.has(ch)) channelDateMap.set(ch, new Map());
        const dateMap = channelDateMap.get(ch)!;
        if (row.status === "completed") {
          dateMap.set(date, (dateMap.get(date) ?? 0) + 1);
        } else if (!dateMap.has(date)) {
          dateMap.set(date, dateMap.get(date) ?? 0);
        }
      }

      const channelNames = channelPerf.map((c) => c.strategy_section_ref);
      const channelGaps = computeConsecutiveZeroDays(
        channelDateMap,
        channelNames,
        periodStart,
        periodEnd,
      );

      // Merge channel perf with gap data
      const channelBreakdown: ChannelPerformanceWithGaps[] = channelPerf.map((c) => {
        const gaps = channelGaps.get(c.strategy_section_ref) ?? {
          daysActive: 0,
          consecutiveZero: 0,
        };
        return {
          ...c,
          days_active: gaps.daysActive,
          consecutive_zero_days: gaps.consecutiveZero,
        };
      });

      // Red flags
      const redFlags = detectRedFlags(channelGaps, channelBreakdown, allExperiments);

      // Total stats
      const totalTasks = channelPerf.reduce((sum, c) => sum + c.total_tasks, 0);
      const totalCompleted = channelPerf.reduce((sum, c) => sum + c.completed, 0);
      const completionRate = totalTasks > 0 ? (totalCompleted / totalTasks) * 100 : 0;

      const daysOfData = Math.ceil(
        (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      const performanceData: PerformanceData = {
        total_tasks: totalTasks,
        completion_rate: completionRate,
        channel_breakdown: channelBreakdown,
        experiments: outcomes,
        experiments_in_progress: inProgress,
        red_flags: redFlags,
        period_start: periodStart,
        period_end: periodEnd,
        days_of_data: daysOfData,
      };

      const orgProfile: OrgProfile = {
        industry: orgRecord.industry as Industry,
        budgetTier: orgRecord.budget_tier as BudgetTier,
        stage: orgRecord.stage,
        growthMotion: orgRecord.growth_motion,
        name: orgRecord.name,
      };

      return {
        orgProfile,
        strategyDoc,
        performanceData,
        totalTasks,
        daysOfData,
        redFlags,
        externalMetrics: externalMetricsSummary.filter(
          (m) => m.source !== "weekly_aggregate",
        ),
      };
    });

    // Step 3: Check thresholds — skip if insufficient data AND no red flags
    const shouldSkip = await step.run("check-thresholds", async () => {
      const hasSufficientData = meetsMinimumThresholds(
        context.orgProfile.budgetTier,
        context.totalTasks,
        context.daysOfData,
      );
      const hasRedFlags = context.redFlags.length > 0;

      if (!hasSufficientData && !hasRedFlags) {
        await updateRunRecord(supabase, runRecordId, {
          status: "skipped",
          skipped_reason: `insufficient_data: ${context.totalTasks} tasks, ${context.daysOfData} days (tier: ${context.orgProfile.budgetTier})`,
          completed_at: new Date().toISOString(),
          data_snapshot: context.performanceData,
        });
        return true;
      }

      return false;
    });

    if (shouldSkip) {
      return { success: true, skipped: true, org_id, refinement_id };
    }

    // Step 4: Build prompt (includes external metrics as additional context)
    const promptResult = await step.run("build-prompt", async () => {
      const benchmarks = getIndustryBenchmarks(context.orgProfile.industry);
      const result = assembleRefinerPrompt(
        context.orgProfile,
        context.strategyDoc.content,
        context.performanceData,
        benchmarks,
      );

      // Append external metrics to user prompt if available
      if (context.externalMetrics.length > 0) {
        const metricsBlock = context.externalMetrics
          .map((m) => `- ${m.source} / ${m.metric_name}: ${m.total_value.toLocaleString()} (${m.count} data points)`)
          .join("\n");

        result.userPrompt += `\n\n## External Metrics (Last 30 Days)\n${metricsBlock}`;
      }

      return result;
    });

    // Step 5: Reserve credits
    const ledgerId = await step.run("reserve-credits", async () => {
      return reserveCredits(
        ctx,
        STRATEGY_REFINEMENT_COST,
        `strategy-refinement:${refinement_id}`,
        refinement_id,
      );
    });

    // Step 6: Call Claude API
    const claudeResult = await step.run("call-claude", async () => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

      const startTime = Date.now();
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: promptResult.systemPrompt,
        messages: [{ role: "user", content: promptResult.userPrompt }],
      });

      const content = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n\n");

      return {
        content,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        durationMs: Date.now() - startTime,
      };
    });

    // Step 7: Validate suggestions + retry with correction if needed
    const validated = await step.run("validate-suggestions", async () => {
      let finalContent = claudeResult.content;
      let validation = validateRefinerOutput(finalContent);
      let retryCount = 0;

      if (!validation.valid) {
        console.warn(
          "[inngest:refine] Validation failed, retrying:",
          validation.errors,
        );
        retryCount = 1;

        const correctionPrompt = buildRefinerCorrectionPrompt(
          finalContent,
          validation.errors,
        );

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

        const anthropic = new Anthropic({ apiKey });
        const retryResponse = await anthropic.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: promptResult.systemPrompt,
          messages: [
            { role: "user", content: promptResult.userPrompt },
            { role: "assistant", content: finalContent },
            { role: "user", content: correctionPrompt },
          ],
        });

        finalContent = retryResponse.content
          .filter(
            (block): block is Anthropic.TextBlock => block.type === "text",
          )
          .map((block) => block.text)
          .join("\n\n");

        validation = validateRefinerOutput(finalContent);
      }

      if (!validation.suggestions || validation.suggestions.length === 0) {
        throw new Error(
          `Refinement validation failed after ${retryCount} retries: ${validation.errors.join("; ")}`,
        );
      }

      return {
        suggestions: validation.suggestions,
        retryCount,
        rawContent: finalContent,
      };
    });

    // Step 8: Create approval item (INSERT only — safe to retry without duplicates
    // because Inngest step memoization prevents re-execution on success)
    const approvalId = await step.run("create-approval", async () => {
      const suggestionSummary = validated.suggestions
        .map(
          (suggestion, idx) =>
            `${idx + 1}. [${suggestion.category}] ${suggestion.target_section}: ${suggestion.suggested_change.substring(0, 100)}${suggestion.suggested_change.length > 100 ? "..." : ""}`,
        )
        .join("\n");

      const approval = await createApproval(ctx, {
        item_type: "strategy_refinement",
        title: `Strategy Refinement: ${validated.suggestions.length} suggestions`,
        content: `## AI Strategy Refinement Suggestions\n\nBased on ${context.performanceData.days_of_data} days of data (${context.performanceData.total_tasks} tasks, ${context.performanceData.completion_rate.toFixed(1)}% completion rate).\n\n${suggestionSummary}`,
        metadata: {
          suggestions: validated.suggestions,
          data_snapshot: context.performanceData,
          run_id: runRecordId,
          refinement_id,
          model: claudeResult.model,
          input_tokens: claudeResult.inputTokens,
          output_tokens: claudeResult.outputTokens,
          duration_ms: claudeResult.durationMs,
          retry_count: validated.retryCount,
        },
        submitted_by_type: "claude_api",
      });

      return approval.id;
    });

    // Step 9: Update run record (DB-only — safe to retry without re-creating approval)
    await step.run("update-run-completed", async () => {
      await updateRunRecord(supabase, runRecordId, {
        status: "completed",
        raw_suggestions: validated.suggestions,
        suggestion_count: validated.suggestions.length,
        data_snapshot: context.performanceData,
        approval_id: approvalId,
        completed_at: new Date().toISOString(),
      });
    });

    // Step 10: Confirm credits
    await step.run("confirm-credits", async () => {
      await confirmCredits(ctx, ledgerId);
    });

    return {
      success: true,
      org_id,
      refinement_id,
      suggestion_count: validated.suggestions.length,
      approval_id: approvalId,
      duration_ms: claudeResult.durationMs,
    };
  },
);
