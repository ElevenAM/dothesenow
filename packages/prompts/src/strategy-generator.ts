import { getMaxChannels } from "./types.js";
import type { OrgProfile, FrameworkId, ValidationResult } from "./types.js";
import type { BudgetTier } from "@dothesenow/types";
import { buildFrameworkPrompts } from "./frameworks/index.js";
import { extractSection, escapeRegex } from "./markdown-utils.js";

const INDUSTRY_MODIFIERS: Record<string, string> = {
  fintech: `COMPLIANCE GATE: All ROI claims, pricing comparisons, and regulatory content require documented substantiation before publishing. Content timelines must include 3–5 business day compliance review buffer. Conservative claims only — no guaranteed returns or misleading comparisons.`,
  healthtech: `COMPLIANCE GATE: Case studies require HIPAA-compliant de-identification. Clinical claims require medical advisor review. Content timelines must include 5–8 business day compliance review buffer. Evidence-based messaging only.`,
};

const OTHER_INDUSTRY_DISCLAIMER = `IMPORTANT: This strategy uses generic industry assumptions. Validate channel recommendations against your specific market before executing. Run customer discovery interviews with 5–10 prospects before committing budget to any channel.`;

const CAC_STALENESS_WARNING = `NOTE: Industry CAC benchmark data was last verified January 2025. If conditions have changed significantly, verify benchmarks with current market data before committing budget.`;

/**
 * Assemble the full strategy generation prompt from selected framework fragments.
 *
 * Assembly order per reference/strategy-generator-framework-notes.md:
 * 1. System prompt (role, output format, constraints)
 * 2. Org context (industry, budget, stage, growth motion)
 * 3. Bullseye (order 3)
 * 4. AARRR (order 4, if selected)
 * 5. Growth Matrix (order 5, if selected)
 * 6. GACCS structure (order 6)
 * 7. ICE scoring (order 7)
 * 8. Validation reminders
 */
export function assembleStrategyPrompt(
  org: OrgProfile,
  frameworks: FrameworkId[],
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = buildSystemPrompt(org);
  const fragments = buildFrameworkPrompts(org, frameworks);
  const userPrompt = buildUserPrompt(org, fragments);

  return { systemPrompt, userPrompt };
}

function buildSystemPrompt(org: OrgProfile): string {
  const complianceModifier = INDUSTRY_MODIFIERS[org.industry] ?? "";

  return `You are a senior marketing strategist with deep experience in the ${org.industry.replace(/_/g, " ")} industry. You create data-driven, actionable marketing strategies tailored to each company's specific situation.

Your output MUST be a structured GACCS strategy brief in markdown format with exactly 6 sections: Goals, Audience, Channels, Content, Schedule, and Experiment Backlog.

CONSTRAINTS:
- Be specific to this company's industry, budget tier, and stage. Generic advice applicable to any company is a failing.
- All recommendations must be achievable within the stated budget tier.
- Channel recommendations must be backed by realistic CAC estimates.
- Goals must have specific numeric targets tied to measurable outcomes.
- Ensure recommended channels and content leverage the company's specific strengths and market position.
${complianceModifier ? `\n${complianceModifier}` : ""}`;
}

function buildUserPrompt(org: OrgProfile, fragments: { content: string }[]): string {
  const orgContext = buildOrgContext(org);
  const frameworkSections = fragments.map((f) => f.content).join("\n\n");

  return `${orgContext}

${frameworkSections}

${buildValidationReminders(org.budgetTier)}`;
}

function buildOrgContext(org: OrgProfile): string {
  const parts = [
    `## Organization Context`,
    ``,
    `- **Company**: ${org.name}`,
    `- **Industry**: ${org.industry.replace(/_/g, " ")}`,
    `- **Budget Tier**: ${org.budgetTier} (${getBudgetDescription(org.budgetTier)})`,
  ];

  if (org.stage) {
    parts.push(`- **Stage**: ${org.stage}`);
  }
  if (org.growthMotion) {
    parts.push(`- **Growth Motion**: ${org.growthMotion.replace(/_/g, " ")}`);
  }

  if (org.industry === "other") {
    parts.push("", OTHER_INDUSTRY_DISCLAIMER);
  }

  parts.push("", CAC_STALENESS_WARNING);

  return parts.join("\n");
}

function getBudgetDescription(tier: BudgetTier): string {
  switch (tier) {
    case "bootstrap": return "<$1K/month marketing budget";
    case "growth": return "$1K–$10K/month marketing budget";
    case "scale": return "$10K+/month marketing budget";
  }
}

function buildValidationReminders(budgetTier: BudgetTier): string {
  const maxChannels = getMaxChannels(budgetTier);

  return `## Final Validation Checklist

Before producing your output, verify:
1. All 6 GACCS sections are present (Goals, Audience, Channels, Content, Schedule, Experiment Backlog)
2. Goals: 3–5 items, each with specific numeric targets
3. Audience: has Primary, Secondary, Pain points (3–5), Watering holes (2–3)
4. Channels: exactly ${maxChannels} or fewer, each with name, type (owned/earned/paid), rationale, Primary metric, Budget %. Budgets sum to 100%.
5. Content: has Pillars (3–4), Cadence subsection, Formats subsection
6. Schedule: exactly 3 phases (Months 1–2, 3–4, 5–6), each with Theme, Actions (3–5), Success criteria, Decision point
7. Experiment Backlog: minimum 8 rows, ICE Score = Impact × Confidence × Ease (range 1–1000), sorted descending
8. No hallucinated metrics — targets must be achievable for this budget tier and industry
9. Channel recommendations are realistic for the budget tier`;
}

// ─── Output Validation ─────────────────────────────────────────

const REQUIRED_SECTIONS = [
  "Goals",
  "Audience",
  "Channels",
  "Content",
  "Schedule",
  "Experiment Backlog",
];

/**
 * Validate LLM output against the GACCS schema.
 * Performs structural validation using heading-level regex.
 */
export function validateGaccsOutput(
  content: string,
  budgetTier: BudgetTier,
): ValidationResult {
  const errors: string[] = [];

  // Check all 6 required sections are present
  for (const section of REQUIRED_SECTIONS) {
    const pattern = new RegExp(`^##\\s+${escapeRegex(section)}`, "m");
    if (!pattern.test(content)) {
      errors.push(`Missing required section: "${section}"`);
    }
  }

  // Validate Goals: 3-5 bullet items
  const goalsMatch = extractSection(content, "Goals");
  if (goalsMatch) {
    const bulletCount = (goalsMatch.match(/^- /gm) ?? []).length;
    if (bulletCount < 3) errors.push(`Goals: found ${bulletCount} items, need at least 3`);
    if (bulletCount > 5) errors.push(`Goals: found ${bulletCount} items, maximum is 5`);
  }

  // Validate Channels: correct count for budget tier
  const channelsMatch = extractSection(content, "Channels");
  if (channelsMatch) {
    const channelCount = (channelsMatch.match(/^\d+\.\s+\*\*/gm) ?? []).length;
    const maxChannels = getMaxChannels(budgetTier);
    if (channelCount < 1) errors.push(`Channels: no channels found`);
    if (channelCount > maxChannels) {
      errors.push(`Channels: found ${channelCount}, maximum for ${budgetTier} is ${maxChannels}`);
    }
  }

  // Validate Schedule: 3 phases
  const scheduleMatch = extractSection(content, "Schedule");
  if (scheduleMatch) {
    const phaseCount = (scheduleMatch.match(/^###\s+Months\s+\d/gm) ?? []).length;
    if (phaseCount !== 3) errors.push(`Schedule: found ${phaseCount} phases, need exactly 3`);
  }

  // Validate Experiment Backlog: minimum 8 rows
  const backlogMatch = extractSection(content, "Experiment Backlog");
  if (backlogMatch) {
    // Count table rows (lines starting with | that are not the header or separator)
    const tableRows = backlogMatch
      .split("\n")
      .filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("Experiment"));
    if (tableRows.length < 8) {
      errors.push(`Experiment Backlog: found ${tableRows.length} experiments, need at least 8`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build a correction prompt for a retry attempt.
 */
export function buildCorrectionPrompt(
  originalContent: string,
  errors: string[],
): string {
  return `Your previous output had structural issues that need to be fixed. Here are the specific problems:

${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}

Please regenerate the COMPLETE strategy document, fixing all the issues listed above. Keep all the good content from your previous attempt, but ensure the structure matches the required GACCS format exactly.

Your previous output for reference:
${originalContent}`;
}
