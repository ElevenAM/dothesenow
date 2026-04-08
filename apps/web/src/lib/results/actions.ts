"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import { inngest } from "@/lib/inngest/client";
import {
  getExperimentsForOrg,
  getChannelPerformance,
  createExperiment,
  transitionExperimentStatus,
  createExperimentResult,
  getExperimentResults,
  getWeeklyReviews,
} from "@dothesenow/queries";
import type {
  Experiment,
  ExperimentResult,
  CreateExperimentInput,
  CreateExperimentResultInput,
  ChannelPerformanceRow,
  WeeklyReview,
  ExperimentStatus,
} from "@dothesenow/types";

export type {
  Experiment,
  ExperimentResult,
  ChannelPerformanceRow,
  WeeklyReview,
} from "@dothesenow/types";

// ─── Read Actions ───────────────────────────────────────────

export async function getResultsDashboardData(): Promise<{
  experiments: Experiment[];
  channelPerformance: ChannelPerformanceRow[];
}> {
  const { ctx } = await getAuthenticatedOrgContext();

  const [experiments, channelPerformance] = await Promise.all([
    getExperimentsForOrg(ctx),
    getChannelPerformance(ctx),
  ]);

  return { experiments, channelPerformance };
}

export async function getExperimentTrackerData(): Promise<Experiment[]> {
  const { ctx } = await getAuthenticatedOrgContext();
  return getExperimentsForOrg(ctx);
}

export async function getExperimentResultsData(
  experimentId: string,
): Promise<ExperimentResult[]> {
  const { ctx } = await getAuthenticatedOrgContext();
  return getExperimentResults(ctx, experimentId);
}

export async function getChannelPerformanceData(
  dateFrom?: string,
  dateTo?: string,
): Promise<ChannelPerformanceRow[]> {
  const { ctx } = await getAuthenticatedOrgContext();
  return getChannelPerformance(ctx, dateFrom, dateTo);
}

export async function getWeeklyRetrospectivesList(
  limit = 10,
): Promise<WeeklyReview[]> {
  const { ctx } = await getAuthenticatedOrgContext();
  return getWeeklyReviews(ctx, limit);
}

// ─── Write Actions ──────────────────────────────────────────

export async function createNewExperiment(
  input: CreateExperimentInput,
): Promise<Experiment> {
  const { ctx } = await getAuthenticatedOrgContext();
  const experiment = await createExperiment(ctx, input);
  revalidatePath("/", "layout");
  return experiment;
}

export async function updateExperimentStatusAction(
  experimentId: string,
  newStatus: ExperimentStatus,
): Promise<Experiment> {
  const { ctx } = await getAuthenticatedOrgContext();
  const experiment = await transitionExperimentStatus(
    ctx,
    experimentId,
    newStatus,
  );
  revalidatePath("/", "layout");
  return experiment;
}

export async function recordExperimentResultAction(
  input: CreateExperimentResultInput,
): Promise<ExperimentResult> {
  const { ctx } = await getAuthenticatedOrgContext();
  const result = await createExperimentResult(ctx, input);
  revalidatePath("/", "layout");
  return result;
}

export async function triggerWeeklyRetrospective(): Promise<void> {
  const { ctx } = await getAuthenticatedOrgContext();
  await inngest.send({
    name: "results/weekly-retrospective.org",
    data: { org_id: ctx.orgId },
  });
}
