import { inngest } from "../client";
import { filterOrgsByLocalHour, localDateString } from "../utils";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActiveOrgs,
  getTasksForOrg,
  getExperimentsForOrg,
  createWeeklyReview,
} from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";

/**
 * Weekly retrospective cron — runs every hour on Fridays,
 * finds orgs at 4pm local time, and fans out generation events.
 */
export const weeklyRetrospectiveCron = inngest.createFunction(
  {
    id: "weekly-retrospective-cron",
    triggers: [{ cron: "0 * * * 5" }],
    retries: 1,
  },
  async ({ step }) => {
    const supabase = createAdminClient();

    const orgs = await step.run("get-orgs-at-4pm", async () => {
      const allOrgs = await getActiveOrgs(supabase);
      return filterOrgsByLocalHour(allOrgs, 16);
    });

    if (orgs.length === 0) {
      console.log("[inngest:retro] No orgs at 4pm local — skipping");
      return { sent: 0 };
    }

    console.log(
      `[inngest:retro] ${orgs.length} orgs at their local 4pm Friday`,
    );

    await step.sendEvent(
      "fan-out-retro",
      orgs.map((org) => ({
        name: "results/weekly-retrospective.org" as const,
        data: { org_id: org.id },
      })),
    );

    return { sent: orgs.length };
  },
);

/**
 * Weekly retrospective handler — generates a retrospective for a single org.
 * Aggregates tasks and experiments for the week, optionally calls Claude for
 * AI summary, then inserts into mktg_weekly_reviews with ON CONFLICT guard.
 */
export const weeklyRetrospectiveHandler = inngest.createFunction(
  {
    id: "weekly-retrospective-handler",
    triggers: [{ event: "results/weekly-retrospective.org" }],
    concurrency: [{ limit: 5 }],
    retries: 1,
  },
  async ({ event, step }) => {
    const { org_id } = event.data;
    const supabase = createAdminClient();

    // Step 1: Compute week range in org's local timezone
    const weekRange = await step.run("compute-week", async () => {
      const { data: orgRow } = await supabase
        .from("dtn_organizations")
        .select("timezone")
        .eq("id", org_id)
        .single();

      const tz = orgRow?.timezone ?? "America/New_York";
      const todayStr = localDateString(tz);
      const today = new Date(todayStr + "T12:00:00Z");
      const dayOfWeek = today.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri
      const monday = new Date(today);
      monday.setUTCDate(today.getUTCDate() - ((dayOfWeek + 6) % 7));
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);

      return {
        week_start: monday.toISOString().split("T")[0],
        week_end: sunday.toISOString().split("T")[0],
        tz,
      };
    });

    // Step 2: Check idempotency
    const existing = await step.run("check-existing", async () => {
      const { data } = await supabase
        .from("mktg_weekly_reviews")
        .select("id")
        .eq("org_id", org_id)
        .eq("week_start", weekRange.week_start)
        .maybeSingle();
      return data;
    });

    if (existing) {
      console.log(
        `[inngest:retro] Org ${org_id}: retrospective already exists for ${weekRange.week_start}`,
      );
      return { status: "skipped", reason: "already_exists" };
    }

    // Step 3: Aggregate task stats
    const taskStats = await step.run("aggregate-tasks", async () => {
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      const tasks = await getTasksForOrg(ctx, {
        date_from: weekRange.week_start,
        date_to: weekRange.week_end,
      });

      const total = tasks.length;
      const completed = tasks.filter((t) => t.status === "completed").length;
      const failed = tasks.filter((t) => t.status === "failed").length;
      const blocked = tasks.filter((t) => t.status === "blocked").length;
      const skipped = tasks.filter((t) => t.status === "skipped").length;

      // Per-channel breakdown
      const channelMap = new Map<
        string,
        { total: number; completed: number }
      >();
      for (const t of tasks) {
        if (!t.strategy_section_ref) continue;
        const ch = channelMap.get(t.strategy_section_ref) || {
          total: 0,
          completed: 0,
        };
        ch.total++;
        if (t.status === "completed") ch.completed++;
        channelMap.set(t.strategy_section_ref, ch);
      }

      const channels = Object.fromEntries(channelMap);

      return { total, completed, failed, blocked, skipped, channels };
    });

    // Step 4: Aggregate experiment data
    const experimentStats = await step.run("aggregate-experiments", async () => {
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      const experiments = await getExperimentsForOrg(ctx, {
        status: "running",
      });
      return {
        running: experiments.length,
        titles: experiments.map((e) => e.title).slice(0, 5),
      };
    });

    // Step 5: Build retrospective content
    // For the initial implementation, generate a structured summary without
    // Claude API. AI-powered summaries will be enhanced in Phase 9B.
    const retro = await step.run("build-retrospective", async () => {
      const completionRate =
        taskStats.total > 0
          ? Math.round((taskStats.completed / taskStats.total) * 100)
          : 0;

      const wins: string[] = [];
      const challenges: string[] = [];
      const learnings: string[] = [];

      if (completionRate >= 80) {
        wins.push(
          `Strong task completion rate: ${completionRate}% (${taskStats.completed}/${taskStats.total})`,
        );
      } else if (completionRate >= 50) {
        learnings.push(
          `Task completion at ${completionRate}% — room for improvement`,
        );
      } else if (taskStats.total > 0) {
        challenges.push(
          `Low task completion rate: ${completionRate}% (${taskStats.completed}/${taskStats.total})`,
        );
      }

      if (taskStats.failed > 0) {
        challenges.push(`${taskStats.failed} tasks failed this week`);
      }
      if (taskStats.blocked > 0) {
        challenges.push(`${taskStats.blocked} tasks blocked`);
      }
      if (experimentStats.running > 0) {
        wins.push(
          `${experimentStats.running} experiments actively running: ${experimentStats.titles.join(", ")}`,
        );
      }

      // Top performing channels
      for (const [ch, stats] of Object.entries(taskStats.channels)) {
        const rate =
          stats.total > 0
            ? Math.round((stats.completed / stats.total) * 100)
            : 0;
        if (rate >= 80 && stats.total >= 3) {
          const name = ch.includes(".") ? ch.split(".").pop()! : ch;
          wins.push(
            `${name.replace(/([a-z])([A-Z])/g, "$1 $2")}: ${rate}% completion`,
          );
        }
      }

      return {
        metrics: {
          total_tasks: taskStats.total,
          completed: taskStats.completed,
          failed: taskStats.failed,
          blocked: taskStats.blocked,
          skipped: taskStats.skipped,
          completion_rate: completionRate,
          experiments_running: experimentStats.running,
        },
        wins: wins.length > 0 ? wins : null,
        challenges: challenges.length > 0 ? challenges : null,
        learnings: learnings.length > 0 ? learnings : null,
      };
    });

    // Step 6: Insert retrospective (ON CONFLICT guard via catch for TOCTOU safety)
    const result = await step.run("insert-retrospective", async () => {
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      try {
        const review = await createWeeklyReview(ctx, {
          week_start: weekRange.week_start,
          week_end: weekRange.week_end,
          metrics: retro.metrics,
          wins: retro.wins,
          challenges: retro.challenges,
          learnings: retro.learnings,
          generated_by: "system",
        });
        return { id: review.id, status: "created" as const };
      } catch (err: unknown) {
        // UNIQUE constraint violation (23505) means another concurrent run inserted first
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("uq_weekly_reviews_org_week") || message.includes("23505")) {
          console.log(`[inngest:retro] Org ${org_id}: concurrent insert won — skipping`);
          return { id: null, status: "duplicate" as const };
        }
        throw err;
      }
    });

    console.log(
      `[inngest:retro] Org ${org_id}: retrospective created (${result.id})`,
    );
    return { status: "created", reviewId: result.id };
  },
);
