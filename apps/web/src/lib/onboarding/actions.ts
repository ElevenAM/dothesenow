"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createOrganization } from "@/lib/org/actions";
import { inferStage, inferGrowthMotion } from "./inference";
import type { Industry, BudgetTier } from "@dothesenow/types";

export type { Industry, BudgetTier } from "@dothesenow/types";

/**
 * Step 1: Create org with owner membership and default department.
 * Delegates to the existing createOrganization() action.
 */
export async function onboardingCreateOrg(orgName: string): ReturnType<typeof createOrganization> {
  return createOrganization(orgName);
}

type SetProfileResult = { success: true } | { error: string };

/**
 * Step 3: Set industry, budget tier, and inferred stage/growth motion.
 * Resolves the caller's org via auth — does NOT accept orgId from the client.
 * Also stamps onboarding_completed_at to mark wizard completion.
 */
export async function onboardingSetProfile(
  industry: Industry,
  budgetTier: BudgetTier,
): Promise<SetProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Resolve the caller's active org via their membership
  const { data: membership, error: memberError } = await supabase
    .from("dtn_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (memberError) {
    console.error("Failed to resolve membership:", memberError);
    return { error: "Something went wrong. Please try again." };
  }

  if (!membership) {
    return { error: "No active organization found" };
  }

  let stage: string;
  let growthMotion: string;
  try {
    stage = inferStage(industry, budgetTier);
    growthMotion = inferGrowthMotion(industry, budgetTier);
  } catch (err) {
    console.error("Inference failed:", err);
    return { error: "Unable to determine your stage. Please try again." };
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("dtn_organizations")
    .update({
      industry,
      stage,
      budget_tier: budgetTier,
      growth_motion: growthMotion,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", membership.org_id);

  if (updateError) {
    console.error("Failed to update org profile:", updateError);
    return { error: "Failed to save profile. Please try again." };
  }

  return { success: true };
}
