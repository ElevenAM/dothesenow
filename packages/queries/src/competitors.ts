import type { OrgContext } from "./context.js";
import type {
  Competitor,
  CreateCompetitorInput,
  UpdateCompetitorInput,
} from "@dothesenow/types";
import { QueryError } from "./errors.js";

const TABLE = "mktg_competitors";

export async function getCompetitorsForOrg(
  ctx: OrgContext,
  filters?: { threat_level?: string },
): Promise<Competitor[]> {
  let query = ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId);

  if (filters?.threat_level) query = query.eq("threat_level", filters.threat_level);

  const { data, error } = await query.order("threat_level");

  if (error) throw new QueryError(error.message, TABLE, "getCompetitorsForOrg", ctx.orgId, error);
  return (data ?? []) as Competitor[];
}

export async function upsertCompetitor(
  ctx: OrgContext,
  id: string | undefined,
  input: CreateCompetitorInput | UpdateCompetitorInput,
): Promise<Competitor> {
  if (id) {
    const { data, error } = await ctx.client
      .from(TABLE)
      .update({
        ...input,
        last_analyzed: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("org_id", ctx.orgId)
      .select()
      .single();

    if (error) throw new QueryError(error.message, TABLE, "upsertCompetitor", ctx.orgId, error);
    return data as Competitor;
  }

  const { data, error } = await ctx.client
    .from(TABLE)
    .insert({
      ...input,
      org_id: ctx.orgId,
      last_analyzed: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new QueryError(error.message, TABLE, "upsertCompetitor", ctx.orgId, error);
  return data as Competitor;
}
