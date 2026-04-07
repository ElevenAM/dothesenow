import type { Industry, BudgetTier, Stage, GrowthMotion } from "@dothesenow/types";
import {
  Stage as StageEnum,
  GrowthMotion as GrowthMotionEnum,
} from "@dothesenow/types";

type InferenceKey = `${Industry}:${BudgetTier}`;

const STAGE_MAP: Record<InferenceKey, Stage> = {
  "b2b_saas:bootstrap": StageEnum.Early,
  "b2b_saas:growth": StageEnum.Growth,
  "b2b_saas:scale": StageEnum.Scaling,
  "dev_tools:bootstrap": StageEnum.Early,
  "dev_tools:growth": StageEnum.Growth,
  "dev_tools:scale": StageEnum.Scaling,
  "dtc_ecommerce:bootstrap": StageEnum.Early,
  "dtc_ecommerce:growth": StageEnum.Growth,
  "dtc_ecommerce:scale": StageEnum.Scaling,
  "fintech:bootstrap": StageEnum.Early,
  "fintech:growth": StageEnum.Growth,
  "fintech:scale": StageEnum.Scaling,
  "marketplace:bootstrap": StageEnum.Idea,
  "marketplace:growth": StageEnum.Growth,
  "marketplace:scale": StageEnum.Scaling,
  "healthtech:bootstrap": StageEnum.Early,
  "healthtech:growth": StageEnum.Growth,
  "healthtech:scale": StageEnum.Scaling,
  "other:bootstrap": StageEnum.Early,
  "other:growth": StageEnum.Growth,
  "other:scale": StageEnum.Scaling,
};

const GROWTH_MOTION_MAP: Record<InferenceKey, GrowthMotion> = {
  "b2b_saas:bootstrap": GrowthMotionEnum.ProductLed,
  "b2b_saas:growth": GrowthMotionEnum.ContentLed,
  "b2b_saas:scale": GrowthMotionEnum.SalesLed,
  "dev_tools:bootstrap": GrowthMotionEnum.CommunityLed,
  "dev_tools:growth": GrowthMotionEnum.CommunityLed,
  "dev_tools:scale": GrowthMotionEnum.ProductLed,
  "dtc_ecommerce:bootstrap": GrowthMotionEnum.ContentLed,
  "dtc_ecommerce:growth": GrowthMotionEnum.PaidAcquisition,
  "dtc_ecommerce:scale": GrowthMotionEnum.PaidAcquisition,
  "fintech:bootstrap": GrowthMotionEnum.SalesLed,
  "fintech:growth": GrowthMotionEnum.SalesLed,
  "fintech:scale": GrowthMotionEnum.SalesLed,
  "marketplace:bootstrap": GrowthMotionEnum.ProductLed,
  "marketplace:growth": GrowthMotionEnum.ProductLed,
  "marketplace:scale": GrowthMotionEnum.PaidAcquisition,
  "healthtech:bootstrap": GrowthMotionEnum.ContentLed,
  "healthtech:growth": GrowthMotionEnum.SalesLed,
  "healthtech:scale": GrowthMotionEnum.SalesLed,
  "other:bootstrap": GrowthMotionEnum.ContentLed,
  "other:growth": GrowthMotionEnum.ContentLed,
  "other:scale": GrowthMotionEnum.SalesLed,
};

export function inferStage(industry: Industry, budgetTier: BudgetTier): Stage {
  const result = STAGE_MAP[`${industry}:${budgetTier}`];
  if (!result) {
    throw new Error(`No stage mapping for ${industry}:${budgetTier}`);
  }
  return result;
}

export function inferGrowthMotion(
  industry: Industry,
  budgetTier: BudgetTier,
): GrowthMotion {
  const result = GROWTH_MOTION_MAP[`${industry}:${budgetTier}`];
  if (!result) {
    throw new Error(`No growth motion mapping for ${industry}:${budgetTier}`);
  }
  return result;
}
