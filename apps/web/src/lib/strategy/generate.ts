"use server";

import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import { getCreditBalance } from "@dothesenow/queries";
import { inngest } from "@/lib/inngest/client";
import { STRATEGY_GENERATION_COST } from "@dothesenow/prompts";

export { STRATEGY_GENERATION_COST };

export async function generateStrategy(): Promise<{
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
    },
  });

  return { success: true, generationId };
}
