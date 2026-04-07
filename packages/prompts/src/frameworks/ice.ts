import type { OrgProfile, PromptFragment } from "../types.js";

const PRIMARY_METRICS: Record<string, { metric: string; double: string; halfLift: string }> = {
  b2b_saas: { metric: "Monthly signups", double: "20→40 signups/mo", halfLift: "20→30 signups/mo" },
  dev_tools: { metric: "Weekly active developers", double: "50→100 WAD", halfLift: "50→75 WAD" },
  dtc_ecommerce: { metric: "Monthly orders", double: "100→200 orders/mo", halfLift: "100→150 orders/mo" },
  fintech: { metric: "Monthly active users", double: "200→400 MAU", halfLift: "200→300 MAU" },
  marketplace: { metric: "Monthly transactions", double: "50→100 txns/mo", halfLift: "50→75 txns/mo" },
  healthtech: { metric: "Active pilot practices", double: "3→6 practices", halfLift: "3→5 practices" },
};

export function buildIcePrompt(org: OrgProfile): PromptFragment {
  const metrics = PRIMARY_METRICS[org.industry];
  const metricsContext = metrics
    ? `\nPrimary metric for ${org.industry}: ${metrics.metric}
- "2x" means: ${metrics.double}
- "50% lift" means: ${metrics.halfLift}`
    : "\nUse conservative estimates for primary metrics when calibrating Impact scores.";

  const budgetConstraint = org.budgetTier === "bootstrap"
    ? "\nBudget constraint: For bootstrap tier, apply Ease multiplier of 0.5x for any experiment requiring paid spend >$200/month. This drastically reduces the score for pay-to-play experiments."
    : "";

  return {
    frameworkId: "ice",
    order: 7,
    content: `## ICE Scoring for Experiment Backlog

Score each experiment using ICE (Impact × Confidence × Ease, each 1–10, range 1–1000).

Calibration anchors:

**Impact** (how much does this move the primary metric):
- 10: Could 2x the primary metric
- 7–8: Significant, measurable improvement (20–50% lift)
- 4–6: Moderate improvement (5–20% lift)
- 1–3: Marginal or uncertain improvement

**Confidence** (how sure are we this will work):
- 10: Proven tactic, industry standard, done before
- 7–8: Strong evidence from benchmarks or case studies
- 4–6: Reasonable hypothesis, some supporting data
- 1–3: Unproven, experimental, gut feel

**Ease** (how hard is it to execute):
- 10: Can do this afternoon, no dependencies
- 7–8: A few days of work, minimal dependencies
- 4–6: A week+ of work, some coordination needed
- 1–3: Major effort, multiple dependencies, specialized skills
${metricsContext}
${budgetConstraint}

Sort experiments by ICE score descending (highest priority first). Minimum 8 experiments required.
ICE Score = Impact × Confidence × Ease (MULTIPLICATION, not addition). Range is 1–1,000.`,
  };
}
