export const PLANS = {
  free: {
    name: "Free",
    priceId: null,
    monthlyPrice: 0,
    description: "For individuals getting started",
    limits: {
      members: 2,
      contacts: 100,
      departments: 1,
    },
    features: [
      "1 department",
      "Up to 2 team members",
      "100 contacts",
      "Basic task management",
    ],
  },
  premium: {
    name: "Premium",
    priceId: "price_1THdJURwniZbeb16vKT3tueN",
    monthlyPrice: 9.99,
    description: "For teams that need more power",
    limits: {
      members: -1, // unlimited
      contacts: -1, // unlimited
      departments: -1, // unlimited
    },
    features: [
      "Unlimited departments",
      "Unlimited team members",
      "Unlimited contacts",
      "Advanced task management",
      "Approval workflows",
      "Blog publishing",
      "Priority support",
    ],
  },
} as const;

export type PlanId = keyof typeof PLANS;

const PLAN_HIERARCHY: PlanId[] = ["free", "premium"];

/**
 * Reverse lookup: Stripe price ID -> plan name
 */
export function planFromPriceId(priceId: string): PlanId | null {
  for (const [planId, plan] of Object.entries(PLANS)) {
    if (plan.priceId === priceId) {
      return planId as PlanId;
    }
  }
  return null;
}

/**
 * Check if a plan meets or exceeds the required plan level
 */
export function canAccessFeature(
  currentPlan: PlanId,
  requiredPlan: PlanId
): boolean {
  const currentIndex = PLAN_HIERARCHY.indexOf(currentPlan);
  const requiredIndex = PLAN_HIERARCHY.indexOf(requiredPlan);
  return currentIndex >= requiredIndex;
}

/**
 * Get the limits for a given plan
 */
export function getPlanLimits(plan: PlanId) {
  return PLANS[plan].limits;
}

/**
 * Check if a plan status represents an active subscription
 */
export function isPlanActive(planStatus: string): boolean {
  return planStatus === "active" || planStatus === "trialing";
}

/**
 * Check if an org is in the grace period (payment failed, not yet downgraded)
 */
export function isInGracePeriod(planStatus: string): boolean {
  return planStatus === "past_due";
}
