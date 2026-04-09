"use server";

import { revalidateTag } from "next/cache";
import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import { getCreditBalance, updateOrg } from "@dothesenow/queries";
import { inngest } from "@/lib/inngest/client";
import { STRATEGY_GENERATION_COST } from "@dothesenow/prompts";

export async function generateStrategy(documentIds?: string[]): Promise<{
  success: boolean;
  error?: string;
  generationId?: string;
}> {
  const { auth, ctx } = await getAuthenticatedOrgContext();
  const { org } = auth;

  // Validate org profile is complete
  if (!org.industry) {
    return {
      success: false,
      error: "Please complete onboarding — industry is required for strategy generation.",
    };
  }
  if (!org.budgetTier) {
    return {
      success: false,
      error: "Please complete onboarding — budget tier is required for strategy generation.",
    };
  }

  // Pre-flight credit check (not atomic — the Inngest function does the real reservation)
  const { remaining } = await getCreditBalance(ctx);
  if (remaining !== -1 && remaining < STRATEGY_GENERATION_COST) {
    return {
      success: false,
      error: `Insufficient credits. Strategy generation costs ${STRATEGY_GENERATION_COST} credits, but you have ${remaining} remaining.`,
    };
  }

  const generationId = crypto.randomUUID();

  await inngest.send({
    name: "strategy/generate",
    data: {
      org_id: ctx.orgId,
      triggered_by: auth.user.id,
      generation_id: generationId,
      document_ids: documentIds ?? [],
    },
  });

  return { success: true, generationId };
}

/**
 * Save strategy generation context fields to the org profile.
 * Requires owner or admin role.
 */
export async function saveStrategyContext(fields: {
  productDescription: string;
  valueProposition: string;
  websiteUrl: string | null;
  targetCustomer: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { ctx } = await getAuthenticatedOrgContext(["owner", "admin"]);
    await updateOrg(ctx, {
      product_description: fields.productDescription,
      value_proposition: fields.valueProposition,
      website_url: fields.websiteUrl || null,
      target_customer: fields.targetCustomer || null,
    });
    revalidateTag("strategy", "max");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save context",
    };
  }
}
