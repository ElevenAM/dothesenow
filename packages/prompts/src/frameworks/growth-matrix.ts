import type { OrgProfile, PromptFragment } from "../types.js";

export function buildGrowthMatrixPrompt(org: OrgProfile): PromptFragment {
  const attributionGuidance = org.budgetTier === "growth"
    ? `\nAttribution model: Use position-based attribution (40% first-touch, 20% linear, 40% last-touch). Include this guidance: "Do not cut a channel based solely on last-touch conversion. If Content shows low direct CAC but high view-through, it's driving awareness that other channels convert."`
    : org.budgetTier === "scale"
      ? `\nAttribution model: Use data-driven attribution (requires ~400 conversions/month for statistical significance). If the company hasn't reached this volume yet, fall back to position-based.`
      : "";

  return {
    frameworkId: "growth_matrix",
    order: 5,
    content: `## Growth Matrix Analysis

For a ${org.industry} company at ${org.budgetTier} stage, analyze these 5 growth levers:

| Lever | Description | Key Metrics |
|-------|-------------|-------------|
| Acquisition | Getting new users into the funnel | Visitors, signups, CAC |
| Activation | New users reaching the "aha moment" | Time-to-value, activation rate |
| Retention | Users coming back | DAU/MAU, churn rate, cohort curves |
| Revenue | Users paying (or paying more) | Conversion rate, ARPU, LTV |
| Referral | Users bringing other users | Viral coefficient, referral rate |

For each lever:
1. Assess likely current performance for a typical ${org.industry} company at this stage (1–10)
2. Estimate improvement potential (1–10)
3. Estimate effort required (1–10, inverted: 10 = easy)
4. Calculate priority score: Improvement potential × Effort (inverted)
5. Recommend 2–3 specific tactics

Rank levers by priority score. The top 2 levers should map to Phase 1–2 of the GACCS Schedule.
${attributionGuidance}`,
  };
}
