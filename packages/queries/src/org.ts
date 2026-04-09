import type { OrgContext } from "./context.js";
import type { Organization } from "@dothesenow/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { QueryError } from "./errors.js";

const TABLE = "dtn_organizations";

/**
 * Get all active orgs with their timezone.
 * Used by Inngest cron functions for timezone-based fan-out.
 * Does not require OrgContext since it's a cross-org admin operation.
 *
 * Note: dtn_organizations does not have soft-delete (deleted_at) —
 * see migration 012. All rows in the table are considered active.
 */
export async function getActiveOrgs(
  client: SupabaseClient,
): Promise<Pick<Organization, "id" | "timezone">[]> {
  const { data, error } = await client
    .from(TABLE)
    .select("id, timezone");

  if (error) throw new QueryError(error.message, TABLE, "getActiveOrgs", "all", error);
  return (data ?? []) as Pick<Organization, "id" | "timezone">[];
}

/**
 * Get org by ID. Does not require OrgContext since the caller
 * may not yet know which org they belong to.
 */
export async function getOrgById(
  client: SupabaseClient,
  orgId: string,
): Promise<Organization | null> {
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("id", orgId)
    .maybeSingle();

  if (error) throw new QueryError(error.message, TABLE, "getOrgById", orgId, error);
  return data as Organization | null;
}

/**
 * Get org by slug. Does not require OrgContext since the caller
 * may be looking up an org by slug before establishing context.
 */
export async function getOrgBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<Organization | null> {
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new QueryError(error.message, TABLE, "getOrgBySlug", slug, error);
  return data as Organization | null;
}

export async function updateOrg(
  ctx: OrgContext,
  updates: Partial<Pick<Organization, "name" | "slug" | "logo_url" | "settings" | "industry" | "stage" | "budget_tier" | "growth_motion" | "timezone" | "product_description" | "value_proposition" | "website_url" | "target_customer" | "onboarding_completed_at">>,
): Promise<Organization> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .update(updates)
    .eq("id", ctx.orgId)
    .select()
    .single();

  if (error) throw new QueryError(error.message, TABLE, "updateOrg", ctx.orgId, error);
  return data as Organization;
}
