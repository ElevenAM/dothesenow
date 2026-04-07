import type { OrgContext } from "./context.js";
import type { Insight, CreateInsightInput } from "@dothesenow/types";
import { QueryError } from "./errors.js";

const TABLE = "mktg_insights";

export async function createInsight(
  ctx: OrgContext,
  input: CreateInsightInput,
): Promise<Insight> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .insert({
      ...input,
      org_id: ctx.orgId,
    })
    .select()
    .single();

  if (error) throw new QueryError(error.message, TABLE, "createInsight", ctx.orgId, error);
  return data as Insight;
}

export async function getInsightsForOrg(
  ctx: OrgContext,
  filters?: { insight_type?: string; limit?: number },
): Promise<Insight[]> {
  let query = ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId);

  if (filters?.insight_type) query = query.eq("insight_type", filters.insight_type);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 20);

  if (error) throw new QueryError(error.message, TABLE, "getInsightsForOrg", ctx.orgId, error);
  return (data ?? []) as Insight[];
}
