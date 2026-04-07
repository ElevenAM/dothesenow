import type { Industry, BudgetTier } from "@dothesenow/types";
import type { FrameworkId, OrgProfile, PromptFragment } from "../types.js";
import { buildBullseyePrompt } from "./bullseye.js";
import { buildAarrrPrompt } from "./aarrr.js";
import { buildGrowthMatrixPrompt } from "./growth-matrix.js";
import { buildGaccsPrompt } from "./gaccs.js";
import { buildIcePrompt } from "./ice.js";

const DIGITAL_FUNNEL_INDUSTRIES: Industry[] = [
  "b2b_saas",
  "dev_tools",
  "fintech",
  "marketplace",
];

const PLG_MOTION_INDUSTRIES: Industry[] = [
  "b2b_saas",
  "dev_tools",
  "marketplace",
  "fintech",
  "dtc_ecommerce",
  "healthtech",
];

/**
 * Select which marketing frameworks to include in the strategy generation
 * based on the org's industry and budget tier.
 *
 * Logic from: packages/prompts/reference/framework-selection-matrix.md
 */
export function selectFrameworks(
  industry: Industry,
  budgetTier: BudgetTier,
): FrameworkId[] {
  const frameworks: FrameworkId[] = ["bullseye", "gaccs", "ice"];

  if (DIGITAL_FUNNEL_INDUSTRIES.includes(industry)) {
    frameworks.push("aarrr");
  }

  if (
    budgetTier !== "bootstrap" &&
    PLG_MOTION_INDUSTRIES.includes(industry)
  ) {
    frameworks.push("growth_matrix");
  }

  return frameworks;
}

const FRAMEWORK_BUILDERS: Record<
  FrameworkId,
  (org: OrgProfile) => PromptFragment
> = {
  bullseye: buildBullseyePrompt,
  aarrr: buildAarrrPrompt,
  growth_matrix: buildGrowthMatrixPrompt,
  gaccs: buildGaccsPrompt,
  ice: buildIcePrompt,
};

/**
 * Build prompt fragments for the selected frameworks, sorted by assembly order.
 */
export function buildFrameworkPrompts(
  org: OrgProfile,
  frameworks: FrameworkId[],
): PromptFragment[] {
  return frameworks
    .map((id) => FRAMEWORK_BUILDERS[id](org))
    .sort((a, b) => a.order - b.order);
}

export { buildBullseyePrompt } from "./bullseye.js";
export { buildAarrrPrompt } from "./aarrr.js";
export { buildGrowthMatrixPrompt } from "./growth-matrix.js";
export { buildGaccsPrompt } from "./gaccs.js";
export { buildIcePrompt } from "./ice.js";
