import type { OrgProfile, PromptFragment } from "../types.js";

const INDUSTRY_FUNNEL_METRICS: Record<string, {
  activation: string;
  retention: string;
  revenue: string;
}> = {
  b2b_saas: {
    activation: "First workflow created",
    retention: "Weekly login",
    revenue: "Trial → paid conversion",
  },
  dev_tools: {
    activation: "First API call or integration",
    retention: "Weekly API calls",
    revenue: "Free → paid tier upgrade",
  },
  fintech: {
    activation: "First transaction or account connection",
    retention: "Monthly transaction",
    revenue: "Account balance or transaction volume",
  },
  marketplace: {
    activation: "First listing (supply) / first purchase (demand)",
    retention: "Monthly transactions",
    revenue: "GMV, take rate",
  },
};

export function buildAarrrPrompt(org: OrgProfile): PromptFragment {
  const metrics = INDUSTRY_FUNNEL_METRICS[org.industry];
  const metricsContext = metrics
    ? `\nIndustry-specific funnel definitions for ${org.industry}:
- Activation: ${metrics.activation}
- Retention: ${metrics.retention}
- Revenue: ${metrics.revenue}`
    : "";

  return {
    frameworkId: "aarrr",
    order: 4,
    content: `## AARRR Pirate Metrics Analysis

For this ${org.industry} company, define the AARRR funnel with five stages:

1. **Acquisition**: How do users find us? (visitors, signups, channel attribution)
2. **Activation**: Do they have a good first experience? (onboarding completion, time-to-value)
3. **Retention**: Do they come back? (D7/D30 retention, weekly active rate, churn)
4. **Revenue**: Do they pay? (trial→paid conversion, ARPU, MRR)
5. **Referral**: Do they tell others? (referral invites sent, viral coefficient, NPS)
${metricsContext}

For each stage:
1. Primary metric for this industry
2. Realistic baseline for a ${org.budgetTier}-stage company
3. 6-month target
4. Top experiment to move this metric

Identify the weakest funnel stage and map it to Phase 1 of the GACCS Schedule.
Include at least one metric per stage in the Goals section.`,
  };
}
