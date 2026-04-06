import { describe, it, expect } from "vitest";
import {
  PlanTier,
  PLAN_LIMITS,
  PLAN_HIERARCHY,
  PLAN_PRICE_IDS,
  canAccessFeature,
  getPlanLimits,
  planFromPriceId,
  isPlanActive,
  isInGracePeriod,
} from "../plans.js";

describe("PlanTier", () => {
  it("has all 5 tier values", () => {
    expect(Object.values(PlanTier)).toEqual(["free", "starter", "growth", "team", "enterprise"]);
  });
});

describe("PLAN_LIMITS", () => {
  it("has entries for all tiers", () => {
    for (const tier of PLAN_HIERARCHY) {
      expect(PLAN_LIMITS[tier], `Missing limits for ${tier}`).toBeDefined();
    }
  });

  it("free tier has constrained limits", () => {
    const free = PLAN_LIMITS.free;
    expect(free.members).toBe(2);
    expect(free.contacts).toBe(100);
    expect(free.departments).toBe(1);
    expect(free.credits).toBe(0);
    expect(free.strategyDocs).toBe(3);
  });

  it("enterprise tier has unlimited everything", () => {
    const enterprise = PLAN_LIMITS.enterprise;
    expect(enterprise.members).toBe(-1);
    expect(enterprise.contacts).toBe(-1);
    expect(enterprise.departments).toBe(-1);
    expect(enterprise.credits).toBe(-1);
    expect(enterprise.strategyDocs).toBe(-1);
  });

  it("limits increase monotonically across tiers", () => {
    for (let i = 1; i < PLAN_HIERARCHY.length; i++) {
      const prev = PLAN_LIMITS[PLAN_HIERARCHY[i - 1]];
      const curr = PLAN_LIMITS[PLAN_HIERARCHY[i]];
      // Each limit should be >= the previous tier (-1 means unlimited, always >= any number)
      for (const key of ["members", "contacts", "departments", "credits", "strategyDocs"] as const) {
        const prevVal = prev[key] === -1 ? Infinity : prev[key];
        const currVal = curr[key] === -1 ? Infinity : curr[key];
        expect(currVal, `${key}: ${PLAN_HIERARCHY[i]} should >= ${PLAN_HIERARCHY[i - 1]}`).toBeGreaterThanOrEqual(prevVal);
      }
    }
  });
});

describe("canAccessFeature", () => {
  it("free cannot access starter features", () => {
    expect(canAccessFeature("free", "starter")).toBe(false);
  });

  it("starter can access free features", () => {
    expect(canAccessFeature("starter", "free")).toBe(true);
  });

  it("same tier can access own features", () => {
    expect(canAccessFeature("enterprise", "enterprise")).toBe(true);
    expect(canAccessFeature("free", "free")).toBe(true);
  });

  it("enterprise can access all features", () => {
    for (const tier of PLAN_HIERARCHY) {
      expect(canAccessFeature("enterprise", tier)).toBe(true);
    }
  });

  it("free cannot access any higher tier", () => {
    for (const tier of PLAN_HIERARCHY.slice(1)) {
      expect(canAccessFeature("free", tier)).toBe(false);
    }
  });
});

describe("getPlanLimits", () => {
  it("returns correct limits for each tier", () => {
    for (const tier of PLAN_HIERARCHY) {
      expect(getPlanLimits(tier)).toBe(PLAN_LIMITS[tier]);
    }
  });
});

describe("planFromPriceId", () => {
  it("returns starter for the current premium price ID", () => {
    expect(planFromPriceId("price_1THdJURwniZbeb16vKT3tueN")).toBe("starter");
  });

  it("returns null for unknown price ID", () => {
    expect(planFromPriceId("price_unknown_123")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(planFromPriceId("")).toBeNull();
  });
});

describe("isPlanActive", () => {
  it("active status returns true", () => {
    expect(isPlanActive("active")).toBe(true);
  });

  it("trialing status returns true", () => {
    expect(isPlanActive("trialing")).toBe(true);
  });

  it("canceled status returns false", () => {
    expect(isPlanActive("canceled")).toBe(false);
  });

  it("past_due status returns false", () => {
    expect(isPlanActive("past_due")).toBe(false);
  });
});

describe("isInGracePeriod", () => {
  it("past_due returns true", () => {
    expect(isInGracePeriod("past_due")).toBe(true);
  });

  it("active returns false", () => {
    expect(isInGracePeriod("active")).toBe(false);
  });

  it("canceled returns false", () => {
    expect(isInGracePeriod("canceled")).toBe(false);
  });
});
