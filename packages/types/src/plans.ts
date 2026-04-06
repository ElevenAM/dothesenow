export const PlanTier = {
  Free: "free",
  Starter: "starter",
  Growth: "growth",
  Team: "team",
  Enterprise: "enterprise",
} as const;
export type PlanTier = (typeof PlanTier)[keyof typeof PlanTier];

export interface PlanLimits {
  members: number; // -1 = unlimited
  contacts: number; // -1 = unlimited
  departments: number; // -1 = unlimited
  credits: number; // AI credits per month
  strategyDocs: number; // -1 = unlimited
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: { members: 2, contacts: 100, departments: 1, credits: 0, strategyDocs: 3 },
  starter: { members: 5, contacts: 500, departments: 3, credits: 50, strategyDocs: 10 },
  growth: { members: 10, contacts: -1, departments: -1, credits: 200, strategyDocs: -1 },
  team: { members: -1, contacts: -1, departments: -1, credits: 500, strategyDocs: -1 },
  enterprise: { members: -1, contacts: -1, departments: -1, credits: -1, strategyDocs: -1 },
};

export const PLAN_HIERARCHY: PlanTier[] = ["free", "starter", "growth", "team", "enterprise"];

// Price ID lookup — only active tiers have price IDs.
// Phase 4B will populate the remaining tiers.
export const PLAN_PRICE_IDS: Partial<Record<PlanTier, string>> = {
  starter: "price_1THdJURwniZbeb16vKT3tueN", // current "premium" price
};

export function canAccessFeature(current: PlanTier, required: PlanTier): boolean {
  return PLAN_HIERARCHY.indexOf(current) >= PLAN_HIERARCHY.indexOf(required);
}

export function getPlanLimits(plan: PlanTier): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function planFromPriceId(priceId: string): PlanTier | null {
  for (const [tier, id] of Object.entries(PLAN_PRICE_IDS)) {
    if (id === priceId) return tier as PlanTier;
  }
  return null;
}

export function isPlanActive(planStatus: string): boolean {
  return planStatus === "active" || planStatus === "trialing";
}

export function isInGracePeriod(planStatus: string): boolean {
  return planStatus === "past_due";
}
