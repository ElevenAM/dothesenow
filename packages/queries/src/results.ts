import type { OrgContext } from "./context.js";
import type {
  Experiment,
  ExperimentResult,
  CreateExperimentInput,
  CreateExperimentResultInput,
  ChannelPerformanceRow,
  WeeklyReview,
  ExperimentStatus,
} from "@dothesenow/types";
import { QueryError } from "./errors.js";

const EXPERIMENTS_TABLE = "dtn_experiments";
const RESULTS_TABLE = "dtn_experiment_results";
const REVIEWS_TABLE = "mktg_weekly_reviews";

// ─── State Machine ──────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  backlog: ["running"],
  running: ["completed"],
  completed: ["won", "lost"],
};

// ─── Experiments ────────────────────────────────────────────

export async function getExperimentsForOrg(
  ctx: OrgContext,
  filters?: { status?: ExperimentStatus; strategy_section_ref?: string },
): Promise<Experiment[]> {
  let query = ctx.client
    .from(EXPERIMENTS_TABLE)
    .select("*")
    .eq("org_id", ctx.orgId);

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.strategy_section_ref)
    query = query.eq("strategy_section_ref", filters.strategy_section_ref);

  const { data, error } = await query.order("created_at", {
    ascending: false,
  });

  if (error)
    throw new QueryError(
      error.message,
      EXPERIMENTS_TABLE,
      "getExperimentsForOrg",
      ctx.orgId,
      error,
    );
  return (data ?? []) as Experiment[];
}

export async function getExperimentById(
  ctx: OrgContext,
  experimentId: string,
): Promise<Experiment | null> {
  const { data, error } = await ctx.client
    .from(EXPERIMENTS_TABLE)
    .select("*")
    .eq("id", experimentId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (error)
    throw new QueryError(
      error.message,
      EXPERIMENTS_TABLE,
      "getExperimentById",
      ctx.orgId,
      error,
    );
  return data as Experiment | null;
}

export async function createExperiment(
  ctx: OrgContext,
  input: CreateExperimentInput,
): Promise<Experiment> {
  const { data, error } = await ctx.client
    .from(EXPERIMENTS_TABLE)
    .insert({ ...input, org_id: ctx.orgId })
    .select()
    .single();

  if (error)
    throw new QueryError(
      error.message,
      EXPERIMENTS_TABLE,
      "createExperiment",
      ctx.orgId,
      error,
    );
  return data as Experiment;
}

export async function updateExperiment(
  ctx: OrgContext,
  experimentId: string,
  updates: Partial<
    Pick<
      Experiment,
      | "title"
      | "hypothesis"
      | "description"
      | "success_metric"
      | "success_target"
      | "baseline_value"
      | "planned_duration_days"
      | "strategy_section_ref"
    >
  >,
): Promise<Experiment> {
  const { data, error } = await ctx.client
    .from(EXPERIMENTS_TABLE)
    .update(updates)
    .eq("id", experimentId)
    .eq("org_id", ctx.orgId)
    .select()
    .single();

  if (error)
    throw new QueryError(
      error.message,
      EXPERIMENTS_TABLE,
      "updateExperiment",
      ctx.orgId,
      error,
    );
  return data as Experiment;
}

export async function transitionExperimentStatus(
  ctx: OrgContext,
  experimentId: string,
  newStatus: ExperimentStatus,
): Promise<Experiment> {
  // Fetch current status
  const experiment = await getExperimentById(ctx, experimentId);
  if (!experiment) {
    throw new QueryError(
      "Experiment not found",
      EXPERIMENTS_TABLE,
      "transitionExperimentStatus",
      ctx.orgId,
    );
  }

  const allowed = VALID_TRANSITIONS[experiment.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new QueryError(
      `Invalid transition: ${experiment.status} → ${newStatus}`,
      EXPERIMENTS_TABLE,
      "transitionExperimentStatus",
      ctx.orgId,
    );
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { status: newStatus };
  if (newStatus === "running") updates.started_at = now;
  if (newStatus === "completed") updates.completed_at = now;

  const { data, error } = await ctx.client
    .from(EXPERIMENTS_TABLE)
    .update(updates)
    .eq("id", experimentId)
    .eq("org_id", ctx.orgId)
    .select()
    .single();

  if (error)
    throw new QueryError(
      error.message,
      EXPERIMENTS_TABLE,
      "transitionExperimentStatus",
      ctx.orgId,
      error,
    );
  return data as Experiment;
}

// ─── Experiment Results ─────────────────────────────────────

export async function getExperimentResults(
  ctx: OrgContext,
  experimentId: string,
): Promise<ExperimentResult[]> {
  const { data, error } = await ctx.client
    .from(RESULTS_TABLE)
    .select("*")
    .eq("experiment_id", experimentId)
    .eq("org_id", ctx.orgId)
    .order("recorded_at", { ascending: false });

  if (error)
    throw new QueryError(
      error.message,
      RESULTS_TABLE,
      "getExperimentResults",
      ctx.orgId,
      error,
    );
  return (data ?? []) as ExperimentResult[];
}

export async function createExperimentResult(
  ctx: OrgContext,
  input: CreateExperimentResultInput,
): Promise<ExperimentResult> {
  const { data, error } = await ctx.client
    .from(RESULTS_TABLE)
    .insert({ ...input, org_id: ctx.orgId })
    .select()
    .single();

  if (error)
    throw new QueryError(
      error.message,
      RESULTS_TABLE,
      "createExperimentResult",
      ctx.orgId,
      error,
    );
  return data as ExperimentResult;
}

// ─── Channel Performance ────────────────────────────────────

export async function getChannelPerformance(
  ctx: OrgContext,
  dateFrom?: string,
  dateTo?: string,
): Promise<ChannelPerformanceRow[]> {
  const params: Record<string, unknown> = { p_org_id: ctx.orgId };
  if (dateFrom) params.p_date_from = dateFrom;
  if (dateTo) params.p_date_to = dateTo;

  const { data, error } = await ctx.client.rpc(
    "get_channel_performance",
    params,
  );

  if (error)
    throw new QueryError(
      error.message,
      "rpc:get_channel_performance",
      "getChannelPerformance",
      ctx.orgId,
      error,
    );
  return (data ?? []) as ChannelPerformanceRow[];
}

// ─── Weekly Retrospectives ──────────────────────────────────

export async function getLatestWeeklyRetrospective(
  ctx: OrgContext,
): Promise<WeeklyReview | null> {
  const { data, error } = await ctx.client
    .from(REVIEWS_TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error)
    throw new QueryError(
      error.message,
      REVIEWS_TABLE,
      "getLatestWeeklyRetrospective",
      ctx.orgId,
      error,
    );
  return data as WeeklyReview | null;
}
