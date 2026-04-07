import type { OrgContext } from "./context.js";
import type {
  Campaign,
  WeeklyReview,
  CreateCampaignInput,
  CreateWeeklyReviewInput,
} from "@dothesenow/types";
import { QueryError } from "./errors.js";

const CAMPAIGNS_TABLE = "mktg_campaigns";
const REVIEWS_TABLE = "mktg_weekly_reviews";

export async function createCampaign(
  ctx: OrgContext,
  input: CreateCampaignInput,
): Promise<Campaign> {
  const { data, error } = await ctx.client
    .from(CAMPAIGNS_TABLE)
    .insert({
      ...input,
      org_id: ctx.orgId,
    })
    .select()
    .single();

  if (error) throw new QueryError(error.message, CAMPAIGNS_TABLE, "createCampaign", ctx.orgId, error);
  return data as Campaign;
}

export async function getCampaignsForOrg(
  ctx: OrgContext,
  filters?: { status?: string; limit?: number },
): Promise<Campaign[]> {
  let query = ctx.client
    .from(CAMPAIGNS_TABLE)
    .select("*")
    .eq("org_id", ctx.orgId);

  if (filters?.status) query = query.eq("status", filters.status);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 20);

  if (error) throw new QueryError(error.message, CAMPAIGNS_TABLE, "getCampaignsForOrg", ctx.orgId, error);
  return (data ?? []) as Campaign[];
}

export async function createWeeklyReview(
  ctx: OrgContext,
  input: CreateWeeklyReviewInput,
): Promise<WeeklyReview> {
  const { data, error } = await ctx.client
    .from(REVIEWS_TABLE)
    .insert({
      ...input,
      org_id: ctx.orgId,
    })
    .select()
    .single();

  if (error) throw new QueryError(error.message, REVIEWS_TABLE, "createWeeklyReview", ctx.orgId, error);
  return data as WeeklyReview;
}

export async function getWeeklyReviews(
  ctx: OrgContext,
  limit = 10,
): Promise<WeeklyReview[]> {
  const { data, error } = await ctx.client
    .from(REVIEWS_TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("week_start", { ascending: false })
    .limit(limit);

  if (error) throw new QueryError(error.message, REVIEWS_TABLE, "getWeeklyReviews", ctx.orgId, error);
  return (data ?? []) as WeeklyReview[];
}
