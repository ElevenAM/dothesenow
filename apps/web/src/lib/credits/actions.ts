"use server";

import { createClient } from "@/lib/supabase/server";
import { PLAN_LIMITS, type PlanTier } from "@dothesenow/types";
import { getCreditBalance, getCreditHistory } from "@dothesenow/queries";

export interface CreditUsage {
  remaining: number;
  total: number;
  resetAt: string | null;
  recentHistory: {
    id: string;
    amount: number;
    reason: string;
    status: string;
    created_at: string;
  }[];
}

/**
 * Get credit usage data for the current user's org.
 * Used by the billing page to display credit status.
 */
export async function getCreditUsage(): Promise<CreditUsage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  // Get user's org
  const { data: membership } = await supabase
    .from("dtn_memberships")
    .select("org_id, dtn_organizations(id, plan)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) {
    throw new Error("No active organization membership");
  }

  const org = membership.dtn_organizations as unknown as {
    id: string;
    plan: string;
  };

  const ctx = { client: supabase, orgId: org.id };

  const balance = await getCreditBalance(ctx);
  const history = await getCreditHistory(ctx, { limit: 10 });

  const planLimits = PLAN_LIMITS[org.plan as PlanTier];
  const total = planLimits?.credits ?? 0;

  return {
    remaining: balance.remaining,
    total,
    resetAt: balance.resetAt,
    recentHistory: history.entries.map((e) => ({
      id: e.id,
      amount: e.amount,
      reason: e.reason,
      status: e.status,
      created_at: e.created_at,
    })),
  };
}
