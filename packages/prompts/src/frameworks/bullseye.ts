import { getMaxChannels } from "../types.js";
import type { OrgProfile, PromptFragment } from "../types.js";

/**
 * CAC benchmark data by industry × channel.
 * Source: packages/prompts/reference/industry-cac-benchmarks.md
 */
/**
 * CAC benchmark data by industry × channel.
 * Exported for reuse by the strategy refiner (Phase 9B).
 */
export const CAC_DATA: Record<string, { channel: string; median: number; bootstrap: string }[]> = {
  b2b_saas: [
    { channel: "Organic Search / SEO", median: 205, bootstrap: "$0 spend, 6–12 mo ramp" },
    { channel: "Content Marketing", median: 280, bootstrap: "$0 spend, undefined CAC" },
    { channel: "LinkedIn Organic", median: 230, bootstrap: "~$50 founder-led" },
    { channel: "LinkedIn Ads", median: 500, bootstrap: "Requires budget" },
    { channel: "Google Ads (Search)", median: 350, bootstrap: "Requires budget" },
    { channel: "Product-Led Growth", median: 100, bootstrap: "$0 if natural loop" },
    { channel: "Events / Conferences", median: 800, bootstrap: "Not viable Mo 1–3" },
    { channel: "Outbound Sales", median: 700, bootstrap: "~$440 founder-led" },
  ],
  dev_tools: [
    { channel: "Documentation / Tutorials", median: 70, bootstrap: "$0 organic" },
    { channel: "Community (Discord/Slack)", median: 100, bootstrap: "~$50–100 organic" },
    { channel: "Open Source / GitHub", median: 50, bootstrap: "$0 if exists" },
    { channel: "Hacker News / Reddit", median: 120, bootstrap: "Volatile, $0 spend" },
    { channel: "Dev Podcast Sponsorship", median: 350, bootstrap: "Not viable Mo 1–3" },
    { channel: "Google Ads", median: 450, bootstrap: "Requires budget" },
    { channel: "Conference Sponsorship", median: 600, bootstrap: "Not viable Mo 1–3" },
  ],
  dtc_ecommerce: [
    { channel: "Email Marketing", median: 12, bootstrap: "Undefined (no list)" },
    { channel: "SMS Marketing", median: 15, bootstrap: "Undefined (no list)" },
    { channel: "Organic Social (IG/TikTok)", median: 25, bootstrap: "$0 spend, slow" },
    { channel: "Meta Ads (Facebook/IG)", median: 45, bootstrap: "$45–80 paid required" },
    { channel: "Google Shopping", median: 35, bootstrap: "$35–60 paid required" },
    { channel: "Influencer Marketing", median: 60, bootstrap: "Not viable Mo 1–3" },
    { channel: "TikTok Ads", median: 30, bootstrap: "$30–50 paid required" },
    { channel: "Affiliate Marketing", median: 40, bootstrap: "Undefined (no affiliates)" },
  ],
  fintech: [
    { channel: "Organic Search / SEO", median: 300, bootstrap: "$0 spend, 6–12 mo ramp" },
    { channel: "Content Marketing", median: 400, bootstrap: "$0 spend, undefined" },
    { channel: "LinkedIn Organic", median: 300, bootstrap: "~$150–200 founder-led" },
    { channel: "Partnership / Co-marketing", median: 200, bootstrap: "Requires partner" },
    { channel: "Google Ads", median: 700, bootstrap: "$700+ paid required" },
    { channel: "Fintech Directories", median: 180, bootstrap: "Listing lead time" },
    { channel: "Conferences (virtual)", median: 500, bootstrap: "Not viable Mo 1–3" },
  ],
  marketplace: [
    { channel: "Direct Outreach (supply)", median: 100, bootstrap: "~$50–100 founder-led" },
    { channel: "SEO (demand)", median: 70, bootstrap: "$0 spend, undefined" },
    { channel: "Referral Programs", median: 30, bootstrap: "Undefined (no base)" },
    { channel: "Community / Forums", median: 50, bootstrap: "~$30–50 organic" },
    { channel: "Google Ads", median: 100, bootstrap: "$100+ paid required" },
    { channel: "Social Media Organic", median: 40, bootstrap: "$0 spend, slow" },
    { channel: "PR / Press", median: 200, bootstrap: "Not viable Mo 1–3" },
  ],
  healthtech: [
    { channel: "Professional Content / SEO", median: 400, bootstrap: "$0 spend, 6–12 mo ramp" },
    { channel: "Pilot Programs", median: 1000, bootstrap: "Not viable Mo 1–3" },
    { channel: "Professional Networks", median: 500, bootstrap: "Requires access" },
    { channel: "LinkedIn (healthcare pros)", median: 350, bootstrap: "~$200–300 founder-led" },
    { channel: "Healthcare Directories", median: 200, bootstrap: "Listing lead time" },
    { channel: "Webinars / CME Events", median: 300, bootstrap: "Not viable Mo 1–3" },
    { channel: "Outbound Sales", median: 1500, bootstrap: "Not viable Mo 1–3" },
  ],
};

const TRACTION_CHANNELS = [
  "Viral Marketing",
  "PR / Press",
  "Unconventional PR",
  "Search Engine Marketing (SEM)",
  "Social & Display Ads",
  "Offline Ads",
  "Search Engine Optimization (SEO)",
  "Content Marketing",
  "Email Marketing",
  "Engineering as Marketing",
  "Targeting Blogs",
  "Business Development / Partnerships",
  "Sales",
  "Affiliate Programs",
  "Existing Platforms",
  "Trade Shows / Conferences",
  "Offline Events / Meetups",
  "Speaking Engagements",
  "Community Building",
];

function getCacThreshold(budgetTier: string): number {
  if (budgetTier === "bootstrap") return 300;
  if (budgetTier === "growth") return 800;
  return Infinity;
}

export function buildBullseyePrompt(org: OrgProfile): PromptFragment {
  const industryData = CAC_DATA[org.industry] ?? [];
  const maxChannels = getMaxChannels(org.budgetTier);
  const cacThreshold = getCacThreshold(org.budgetTier);

  const cacContext = industryData.length > 0
    ? `\nIndustry CAC benchmarks for ${org.industry}:\n${industryData.map((c) => `- ${c.channel}: median CAC $${c.median} (bootstrap note: ${c.bootstrap})`).join("\n")}`
    : "\nNo industry-specific CAC data available. Use conservative estimates.";

  const budgetConstraint = org.budgetTier === "bootstrap"
    ? `\nBudget constraint (Bootstrap <$1K/mo): Exclude any paid channel with minimum spend >$500/mo. Exclude conferences, outbound sales, enterprise channels. Only include channels with median CAC < $${cacThreshold} and organic/owned channels.`
    : org.budgetTier === "growth"
      ? `\nBudget constraint (Growth $1K–$10K/mo): Keep 2 proven organic channels, add 1–2 paid experiments. Exclude enterprise channels with median CAC > $${cacThreshold}.`
      : "\nBudget (Scale $10K+/mo): All channels available. Allocate 60% to proven, 30% to experiments, 10% to brand. Flag channels with CAC > 3x industry median.";

  return {
    frameworkId: "bullseye",
    order: 3,
    content: `## Bullseye Channel Ranking

Rank the following 19 traction channels for a ${org.industry} company at the ${org.budgetTier} budget tier. Organize into three rings:

- **Inner Ring** (top ${Math.min(3, maxChannels)} channels): Highest expected ROI given industry and budget. For each: rationale, estimated CAC range, weeks to first result, and a specific validation experiment.
- **Middle Ring** (next 3 channels): Promising but unproven. Worth testing next quarter.
- **Outer Ring** (remaining): Low priority or poor fit. Revisit later.

The 19 Traction Channels: ${TRACTION_CHANNELS.join(", ")}
${cacContext}
${budgetConstraint}

The Inner Ring channels will feed directly into the Channels section of the GACCS strategy. Maximum ${maxChannels} channels in the final strategy.`,
  };
}
