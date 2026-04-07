import type { OrgContext } from "./context.js";
import type {
  MarketplaceTask,
  MarketplaceTaskSubmission,
  FreelancerLeaderboardEntry,
  Freelancer,
  TaskMessage,
  CreateMarketplaceTaskInput,
  ReviewSubmissionInput,
  SendTaskMessageInput,
  MarketplaceTaskFilters,
  FreelancerFilters,
} from "@dothesenow/types";
import { QueryError } from "./errors.js";

const TASKS_TABLE = "mktg_tasks";
const SUBMISSIONS_TABLE = "mktg_task_submissions";
const FREELANCERS_TABLE = "mktg_freelancers";
const LEADERBOARD_VIEW = "mktg_freelancer_leaderboard";
const MESSAGES_TABLE = "mktg_task_messages";

export async function getMarketplaceTasks(
  ctx: OrgContext,
  filters?: MarketplaceTaskFilters,
): Promise<MarketplaceTask[]> {
  let query = ctx.client
    .from(TASKS_TABLE)
    .select("*, mktg_freelancers(name, email)")
    .eq("org_id", ctx.orgId);

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.task_type) query = query.eq("task_type", filters.task_type);
  if (filters?.assigned_to) query = query.eq("assigned_to", filters.assigned_to);
  if (filters?.campaign_id) query = query.eq("campaign_id", filters.campaign_id);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 20);

  if (error) throw new QueryError(error.message, TASKS_TABLE, "getMarketplaceTasks", ctx.orgId, error);
  return (data ?? []) as MarketplaceTask[];
}

export async function createMarketplaceTask(
  ctx: OrgContext,
  input: CreateMarketplaceTaskInput,
): Promise<MarketplaceTask> {
  const { data, error } = await ctx.client
    .from(TASKS_TABLE)
    .insert({
      ...input,
      org_id: ctx.orgId,
      generated_by_ai: true,
      status: input.status ?? "draft",
    })
    .select()
    .single();

  if (error) throw new QueryError(error.message, TASKS_TABLE, "createMarketplaceTask", ctx.orgId, error);
  return data as MarketplaceTask;
}

export async function getTaskSubmissions(
  ctx: OrgContext,
  taskId?: string,
): Promise<MarketplaceTaskSubmission[]> {
  let query = ctx.client
    .from(SUBMISSIONS_TABLE)
    .select("*")
    .eq("org_id", ctx.orgId);

  if (taskId) query = query.eq("task_id", taskId);

  const { data, error } = await query.order("submitted_at", { ascending: false });

  if (error) throw new QueryError(error.message, SUBMISSIONS_TABLE, "getTaskSubmissions", ctx.orgId, error);
  return (data ?? []) as MarketplaceTaskSubmission[];
}

/**
 * Atomic submission review via RPC. Fixes DEBT-001:
 * Updates submission → marks task completed (if approved) → updates freelancer stats.
 * All in one transaction.
 */
export async function reviewSubmission(
  ctx: OrgContext,
  submissionId: string,
  input: ReviewSubmissionInput,
): Promise<Record<string, unknown>> {
  const { data, error } = await ctx.client.rpc("review_marketplace_submission", {
    p_submission_id: submissionId,
    p_org_id: ctx.orgId,
    p_status: input.status,
    p_reviewer_notes: input.reviewer_notes ?? null,
    p_ai_review: input.ai_review ?? null,
    p_rating: input.rating ?? null,
  });

  if (error) throw new QueryError(error.message, SUBMISSIONS_TABLE, "reviewSubmission", ctx.orgId, error);
  return data as Record<string, unknown>;
}

export async function getFreelancerLeaderboard(
  ctx: OrgContext,
  filters?: FreelancerFilters,
): Promise<(FreelancerLeaderboardEntry | Freelancer)[]> {
  // If filtering by skills, query the full freelancers table (view doesn't have skills filtering with overlaps)
  if (filters?.skills) {
    let query = ctx.client
      .from(FREELANCERS_TABLE)
      .select("*")
      .eq("org_id", ctx.orgId)
      .eq("available", true)
      .overlaps("skills", filters.skills);

    if (filters.engagement_type && filters.engagement_type !== "both") {
      query = query.eq("engagement_type", filters.engagement_type);
    }
    if (filters.min_rating) {
      query = query.gte("avg_rating", filters.min_rating);
    }

    const { data, error } = await query;
    if (error) throw new QueryError(error.message, FREELANCERS_TABLE, "getFreelancerLeaderboard", ctx.orgId, error);
    return (data ?? []) as Freelancer[];
  }

  // Default: use the leaderboard view
  let query = ctx.client
    .from(LEADERBOARD_VIEW)
    .select("*")
    .eq("org_id", ctx.orgId);

  if (filters?.engagement_type && filters.engagement_type !== "both") {
    query = query.eq("engagement_type", filters.engagement_type);
  }
  if (filters?.min_rating) {
    query = query.gte("avg_rating", filters.min_rating);
  }

  const { data, error } = await query;
  if (error) throw new QueryError(error.message, LEADERBOARD_VIEW, "getFreelancerLeaderboard", ctx.orgId, error);
  return (data ?? []) as FreelancerLeaderboardEntry[];
}

export async function sendTaskMessage(
  ctx: OrgContext,
  input: SendTaskMessageInput,
): Promise<TaskMessage> {
  const { data, error } = await ctx.client
    .from(MESSAGES_TABLE)
    .insert({
      task_id: input.task_id,
      content: input.content,
      sender_type: input.sender_type ?? "owner",
      org_id: ctx.orgId,
    })
    .select()
    .single();

  if (error) throw new QueryError(error.message, MESSAGES_TABLE, "sendTaskMessage", ctx.orgId, error);
  return data as TaskMessage;
}
