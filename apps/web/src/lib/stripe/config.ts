import {
  type PlanTier,
  PLAN_LIMITS,
  PLAN_PRICE_IDS,
  planFromPriceId,
  getPlanLimits,
  canAccessFeature,
  isPlanActive,
  isInGracePeriod,
} from "@dothesenow/types";

// Re-export from types for consumers that import from stripe/config
export {
  planFromPriceId,
  getPlanLimits,
  canAccessFeature,
  isPlanActive,
  isInGracePeriod,
};

/** Alias for backward compatibility */
export type PlanId = PlanTier;

export interface PlanConfig {
  name: string;
  priceId: string | null;
  monthlyPrice: number;
  description: string;
  credits: number;
  features: string[];
}

export const PLANS: Record<PlanTier, PlanConfig> = {
  free: {
    name: "Free",
    priceId: null,
    monthlyPrice: 0,
    description: "For individuals getting started",
    credits: PLAN_LIMITS.free.credits,
    features: [
      "1 department",
      "Up to 2 team members",
      "100 contacts",
      "Basic task management",
    ],
  },
  starter: {
    name: "Starter",
    priceId: PLAN_PRICE_IDS.starter ?? null,
    monthlyPrice: 9.99,
    description: "For small teams ready to grow",
    credits: PLAN_LIMITS.starter.credits,
    features: [
      "3 departments",
      "Up to 5 team members",
      "500 contacts",
      `${PLAN_LIMITS.starter.credits} AI credits/month`,
      "10 strategy docs",
      "Approval workflows",
    ],
  },
  growth: {
    name: "Growth",
    priceId: PLAN_PRICE_IDS.growth ?? null,
    monthlyPrice: 29.99,
    description: "For teams scaling their marketing",
    credits: PLAN_LIMITS.growth.credits,
    features: [
      "Unlimited departments",
      "Up to 10 team members",
      "Unlimited contacts",
      `${PLAN_LIMITS.growth.credits} AI credits/month`,
      "Unlimited strategy docs",
      "Approval workflows",
      "Blog publishing",
    ],
  },
  team: {
    name: "Team",
    priceId: PLAN_PRICE_IDS.team ?? null,
    monthlyPrice: 79.99,
    description: "For larger teams that need full power",
    credits: PLAN_LIMITS.team.credits,
    features: [
      "Unlimited departments",
      "Unlimited team members",
      "Unlimited contacts",
      `${PLAN_LIMITS.team.credits} AI credits/month`,
      "Unlimited strategy docs",
      "Approval workflows",
      "Blog publishing",
      "Priority support",
    ],
  },
  enterprise: {
    name: "Enterprise",
    priceId: null,
    monthlyPrice: 0,
    description: "Custom solutions for large organizations",
    credits: -1,
    features: [
      "Everything in Team",
      "Unlimited AI credits",
      "Dedicated support",
      "Custom integrations",
      "SSO / SAML",
      "SLA guarantees",
    ],
  },
};

/** All displayable plan tiers in order */
export const PLAN_ORDER: PlanTier[] = ["free", "starter", "growth", "team", "enterprise"];
