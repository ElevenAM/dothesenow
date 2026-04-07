import { describe, it, expect } from "vitest";
import { inferStage, inferGrowthMotion } from "@/lib/onboarding/inference";
import { Industry, BudgetTier, Stage, GrowthMotion } from "@dothesenow/types";

describe("inferStage", () => {
  const cases: [Industry, BudgetTier, Stage][] = [
    [Industry.B2bSaas, BudgetTier.Bootstrap, Stage.Early],
    [Industry.B2bSaas, BudgetTier.Growth, Stage.Growth],
    [Industry.B2bSaas, BudgetTier.Scale, Stage.Scaling],
    [Industry.DevTools, BudgetTier.Bootstrap, Stage.Early],
    [Industry.DevTools, BudgetTier.Growth, Stage.Growth],
    [Industry.DevTools, BudgetTier.Scale, Stage.Scaling],
    [Industry.DtcEcommerce, BudgetTier.Bootstrap, Stage.Early],
    [Industry.DtcEcommerce, BudgetTier.Growth, Stage.Growth],
    [Industry.DtcEcommerce, BudgetTier.Scale, Stage.Scaling],
    [Industry.Fintech, BudgetTier.Bootstrap, Stage.Early],
    [Industry.Fintech, BudgetTier.Growth, Stage.Growth],
    [Industry.Fintech, BudgetTier.Scale, Stage.Scaling],
    [Industry.Marketplace, BudgetTier.Bootstrap, Stage.Idea],
    [Industry.Marketplace, BudgetTier.Growth, Stage.Growth],
    [Industry.Marketplace, BudgetTier.Scale, Stage.Scaling],
    [Industry.Healthtech, BudgetTier.Bootstrap, Stage.Early],
    [Industry.Healthtech, BudgetTier.Growth, Stage.Growth],
    [Industry.Healthtech, BudgetTier.Scale, Stage.Scaling],
    [Industry.Other, BudgetTier.Bootstrap, Stage.Early],
    [Industry.Other, BudgetTier.Growth, Stage.Growth],
    [Industry.Other, BudgetTier.Scale, Stage.Scaling],
  ];

  it.each(cases)(
    "infers stage for %s + %s → %s",
    (industry, budget, expected) => {
      expect(inferStage(industry, budget)).toBe(expected);
    },
  );
});

describe("inferGrowthMotion", () => {
  const cases: [Industry, BudgetTier, GrowthMotion][] = [
    [Industry.B2bSaas, BudgetTier.Bootstrap, GrowthMotion.ProductLed],
    [Industry.B2bSaas, BudgetTier.Growth, GrowthMotion.ContentLed],
    [Industry.B2bSaas, BudgetTier.Scale, GrowthMotion.SalesLed],
    [Industry.DevTools, BudgetTier.Bootstrap, GrowthMotion.CommunityLed],
    [Industry.DevTools, BudgetTier.Growth, GrowthMotion.CommunityLed],
    [Industry.DevTools, BudgetTier.Scale, GrowthMotion.ProductLed],
    [Industry.DtcEcommerce, BudgetTier.Bootstrap, GrowthMotion.ContentLed],
    [Industry.DtcEcommerce, BudgetTier.Growth, GrowthMotion.PaidAcquisition],
    [Industry.DtcEcommerce, BudgetTier.Scale, GrowthMotion.PaidAcquisition],
    [Industry.Fintech, BudgetTier.Bootstrap, GrowthMotion.SalesLed],
    [Industry.Fintech, BudgetTier.Growth, GrowthMotion.SalesLed],
    [Industry.Fintech, BudgetTier.Scale, GrowthMotion.SalesLed],
    [Industry.Marketplace, BudgetTier.Bootstrap, GrowthMotion.ProductLed],
    [Industry.Marketplace, BudgetTier.Growth, GrowthMotion.ProductLed],
    [Industry.Marketplace, BudgetTier.Scale, GrowthMotion.PaidAcquisition],
    [Industry.Healthtech, BudgetTier.Bootstrap, GrowthMotion.ContentLed],
    [Industry.Healthtech, BudgetTier.Growth, GrowthMotion.SalesLed],
    [Industry.Healthtech, BudgetTier.Scale, GrowthMotion.SalesLed],
    [Industry.Other, BudgetTier.Bootstrap, GrowthMotion.ContentLed],
    [Industry.Other, BudgetTier.Growth, GrowthMotion.ContentLed],
    [Industry.Other, BudgetTier.Scale, GrowthMotion.SalesLed],
  ];

  it.each(cases)(
    "infers growth motion for %s + %s → %s",
    (industry, budget, expected) => {
      expect(inferGrowthMotion(industry, budget)).toBe(expected);
    },
  );
});
