import type {
  OrgProfile,
  ValidationResult,
  RefinementSuggestion,
  RefinementCategory,
  ConfidenceLevel,
  PerformanceData,
  ChannelPerformanceWithGaps,
} from "./types.js";
import { CAC_DATA } from "./frameworks/bullseye.js";

const VALID_CATEGORIES: RefinementCategory[] = [
  "channel_swap",
  "budget_realloc",
  "experiment_add",
  "experiment_kill",
  "goal_adjust",
  "audience_refine",
];

const VALID_CONFIDENCE: ConfidenceLevel[] = ["high", "medium", "low"];

const VALID_SECTIONS = [
  "Goals",
  "Audience",
  "Channels",
  "Content",
  "Schedule",
  "Experiment Backlog",
];

// ─── Industry-specific compliance modifiers (shared with strategy-generator) ──

const COMPLIANCE_MODIFIERS: Record<string, string> = {
  fintech: `COMPLIANCE GATE: Any suggestion involving new content types, channel changes affecting compliance workflows, or claims/testimonials must be tagged with compliance_review_required: true. Fintech content timelines must include 3–5 business day compliance review buffer.`,
  healthtech: `COMPLIANCE GATE: Any suggestion involving case studies, clinical claims, or patient data references must be tagged with compliance_review_required: true. Healthtech content timelines must include 5–8 business day compliance review buffer.`,
};

const CAC_STALENESS_WARNING = `NOTE: Industry CAC benchmark data was last verified January 2025. Current date is well past the 6-month staleness window. Treat benchmark values as directional rather than absolute — verify against current market conditions before committing budget changes.`;

// ─── Threshold tables from strategy-refiner-reference.md ──

const THRESHOLD_TABLE = `
Minimum data thresholds by org stage:

| Signal | Bootstrap (<$1K/mo) | Growth ($1K–$10K/mo) | Scale ($10K+/mo) |
|--------|---------------------|----------------------|-------------------|
| Channel performing well | 8+ tasks, 14+ days | 15+ tasks, 20+ days | 25+ tasks, 25+ days |
| Channel underperforming | 8+ tasks, 14+ days, <50% benchmark | 15+ tasks, 20+ days, <50% benchmark | 25+ tasks, 25+ days, <30% benchmark |
| Experiment succeeded | Single positive vs. baseline | 1.5x baseline, 2+ data points | Statistical significance (p<0.1) |
| Experiment failed | 2+ attempts below threshold | 2+ attempts below threshold | 3+ attempts, 95% CI below |
| Budget misallocation | 10+ days, >30% variance | 20+ days, >30% variance | 20+ days, >20% variance |

Only suggest changes backed by sufficient data per these thresholds.
`.trim();

// ─── Category definitions ──

const CATEGORY_DEFINITIONS = `
Refinement Categories:

1. channel_swap: Replace an underperforming channel with a middle-ring alternative.
   Evidence: CAC > 2x industry median AND LTV:CAC < 2:1, OR task completion <30% over 15+ tasks.
   Attribution check: If the underperforming channel has >30% first-touch attribution, flag for manual review instead of auto-swap.

2. budget_realloc: Shift budget between channels based on superior ROI.
   Evidence: One channel has >2x average ROI, OR budget variance >30% from plan for 15+ days.

3. experiment_add: Propose a new experiment based on successful results or emerging signals.
   Evidence: A successful experiment suggests a natural follow-up, OR emerging positive signal.

4. experiment_kill: Remove an experiment that has repeatedly failed or become irrelevant.
   Evidence: 2+ attempts below threshold, OR conditions changed making it irrelevant.

5. goal_adjust: Modify a goal that is unreachable or already achieved.
   Evidence: Linear projection misses goal by >30%, OR goal achieved early.

6. audience_refine: Update audience definition based on actual conversion data.
   Evidence: 3+ experiments show a different demographic converting than the strategy targets.
`.trim();

// ─── Red flag definitions ──

const RED_FLAG_RULES = `
Red Flags (ALWAYS surface regardless of data volume):
- Zero tasks completed in a channel for 10+ consecutive days
- 100% task failure in a channel over 5+ tasks
- Budget overspend >50% on any channel
- Experiment stuck in backlog for 20+ days with no progress
`.trim();

// ─── Prompt assembly ──────────────────────────────────────────

/**
 * Assemble the strategy refinement prompt from org context + performance data.
 */
export function assembleRefinerPrompt(
  org: OrgProfile,
  strategyDoc: string,
  performanceData: PerformanceData,
  benchmarks: string,
): { systemPrompt: string; userPrompt: string } {
  const complianceModifier = COMPLIANCE_MODIFIERS[org.industry] ?? "";

  const systemPrompt = `You are a marketing strategy advisor reviewing 30 days of performance data for a ${org.industry.replace(/_/g, " ")} company (${org.budgetTier} tier).

Your task: Analyze the current GACCS strategy alongside the performance data and generate 3–7 specific refinement suggestions.

${CATEGORY_DEFINITIONS}

${THRESHOLD_TABLE}

${RED_FLAG_RULES}

Prioritize suggestions by:
1. Revenue impact (suggestions affecting revenue or conversion first)
2. Confidence level (high > medium > low)
3. Ease of implementation (quick wins before structural changes)
4. Urgency (red flags before optimizations)

Maximum 7 suggestions. If more candidates exist, keep the top 7 and note "Additional observations available."

LTV normalization: Use LTV:CAC ratio (not raw CAC) as the primary comparison metric. A channel with $500 CAC and $5,000 LTV (10:1) is healthier than one with $100 CAC and $200 LTV (2:1).

${CAC_STALENESS_WARNING}
${complianceModifier ? `\n${complianceModifier}` : ""}

Output a JSON array of suggestions. Each suggestion MUST have these 7 fields:
- category: one of channel_swap, budget_realloc, experiment_add, experiment_kill, goal_adjust, audience_refine
- target_section: one of Goals, Audience, Channels, Content, Schedule, Experiment Backlog
- current_state: quote or describe what the strategy currently says
- suggested_change: specific, actionable change
- evidence: cite specific data points from the performance summary
- confidence: high, medium, or low
- expected_impact: what improvement to expect

Optionally include compliance_review_required: true if the suggestion triggers a compliance gate.

Be specific: "Shift 20% of budget from SEO to Email" not "Consider adjusting budget."
Respond ONLY with a valid JSON array. No markdown fences, no extra text.`;

  const userPrompt = buildUserPrompt(org, strategyDoc, performanceData, benchmarks);

  return { systemPrompt, userPrompt };
}

function buildUserPrompt(
  org: OrgProfile,
  strategyDoc: string,
  performanceData: PerformanceData,
  benchmarks: string,
): string {
  const channelTable = formatChannelTable(performanceData.channel_breakdown);
  const experimentTable = formatExperimentTable(performanceData);
  const redFlagSection = formatRedFlags(performanceData.red_flags);

  return `Company: ${org.name}
Industry: ${org.industry.replace(/_/g, " ")}
Budget tier: ${org.budgetTier}
${org.stage ? `Stage: ${org.stage}` : ""}

Current Strategy (GACCS):
${strategyDoc}

Performance Summary (${performanceData.period_start} to ${performanceData.period_end}, ${performanceData.days_of_data} days):
- Tasks completed: ${performanceData.total_tasks} (${performanceData.completion_rate.toFixed(1)}% completion rate)

Channel Performance:
${channelTable}

${experimentTable}

${redFlagSection}

Industry Benchmarks:
${benchmarks}

Generate refinement suggestions as a JSON array.`;
}

function formatChannelTable(channels: ChannelPerformanceWithGaps[]): string {
  if (channels.length === 0) return "No channel data available.";

  const header = "| Channel | Tasks | Completed | Failed | Skipped | Completion % | Active Days | Zero-Day Streak |";
  const separator = "|---------|-------|-----------|--------|---------|-------------|-------------|-----------------|";
  const rows = channels.map(
    (c) =>
      `| ${c.strategy_section_ref} | ${c.total_tasks} | ${c.completed} | ${c.failed} | ${c.skipped} | ${c.completion_rate}% | ${c.days_active} | ${c.consecutive_zero_days} |`,
  );

  return [header, separator, ...rows].join("\n");
}

function formatExperimentTable(data: PerformanceData): string {
  const completed = data.experiments.filter(
    (e) => e.status !== "running",
  );
  const inProgress = data.experiments_in_progress;

  const parts: string[] = [];

  if (completed.length > 0) {
    const header = "| Experiment | Result | Metric | Baseline | Target | Data Points |";
    const sep = "|------------|--------|--------|----------|--------|-------------|";
    const rows = completed.map(
      (e) =>
        `| ${e.title} | ${e.result} | ${e.metric_value ?? "N/A"} | ${e.baseline_value ?? "N/A"} | ${e.success_target ?? "N/A"} | ${e.data_points} |`,
    );
    parts.push(`Experiment Results:\n${[header, sep, ...rows].join("\n")}`);
  } else {
    parts.push("Experiment Results: No completed experiments in this period.");
  }

  if (inProgress.length > 0) {
    parts.push(
      `Experiments in Progress:\n${inProgress.map((e) => `- ${e.experimentTitle}: ${e.completedSteps}/${e.totalEstimatedSteps} steps completed`).join("\n")}`,
    );
  }

  return parts.join("\n\n");
}

function formatRedFlags(flags: PerformanceData["red_flags"]): string {
  if (flags.length === 0) return "";

  return `RED FLAGS DETECTED:\n${flags.map((f) => `- [${f.type}] ${f.channel_or_experiment}: ${f.detail} (${f.days} days)`).join("\n")}`;
}

// ─── Validation ───────────────────────────────────────────────

/**
 * Validate the raw LLM output against expected refinement suggestion structure.
 */
export function validateRefinerOutput(
  rawOutput: string,
): ValidationResult & { suggestions?: RefinementSuggestion[] } {
  const errors: string[] = [];

  let parsed: unknown;
  try {
    const trimmed = rawOutput.trim();
    parsed = JSON.parse(trimmed);
  } catch {
    return { valid: false, errors: ["Output is not valid JSON"] };
  }

  // Accept both bare array and { suggestions: [...] }
  let items: unknown[];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (
    typeof parsed === "object" &&
    parsed !== null &&
    "suggestions" in parsed &&
    Array.isArray((parsed as Record<string, unknown>).suggestions)
  ) {
    items = (parsed as Record<string, unknown>).suggestions as unknown[];
  } else {
    return {
      valid: false,
      errors: [
        "Output must be a JSON array or an object with a 'suggestions' array property",
      ],
    };
  }

  if (items.length === 0) {
    return { valid: false, errors: ["No suggestions generated. Expected 3–7."] };
  }

  if (items.length > 7) {
    errors.push(
      `Too many suggestions: ${items.length}. Maximum is 7. Keep the top 7 by priority.`,
    );
  }

  const suggestions: RefinementSuggestion[] = [];

  for (let i = 0; i < Math.min(items.length, 7); i++) {
    const item = items[i] as Record<string, unknown>;
    const prefix = `Suggestion ${i + 1}`;

    if (typeof item !== "object" || item === null) {
      errors.push(`${prefix}: must be an object`);
      continue;
    }

    // Per-item errors: track independently so one bad item doesn't discard valid ones
    const itemErrors: string[] = [];

    // category
    if (
      typeof item.category !== "string" ||
      !VALID_CATEGORIES.includes(item.category as RefinementCategory)
    ) {
      itemErrors.push(
        `${prefix}: category must be one of: ${VALID_CATEGORIES.join(", ")}. Got: ${String(item.category)}`,
      );
    }

    // target_section
    if (
      typeof item.target_section !== "string" ||
      !VALID_SECTIONS.includes(item.target_section)
    ) {
      itemErrors.push(
        `${prefix}: target_section must be one of: ${VALID_SECTIONS.join(", ")}. Got: ${String(item.target_section)}`,
      );
    }

    // Required string fields
    for (const field of [
      "current_state",
      "suggested_change",
      "evidence",
      "expected_impact",
    ]) {
      if (
        typeof item[field] !== "string" ||
        (item[field] as string).trim().length === 0
      ) {
        itemErrors.push(`${prefix}: ${field} must be a non-empty string`);
      }
    }

    // confidence
    if (
      typeof item.confidence !== "string" ||
      !VALID_CONFIDENCE.includes(item.confidence as ConfidenceLevel)
    ) {
      itemErrors.push(
        `${prefix}: confidence must be one of: ${VALID_CONFIDENCE.join(", ")}. Got: ${String(item.confidence)}`,
      );
    }

    // Merge item errors into global list for correction prompt context
    errors.push(...itemErrors);

    // Track errors per item so one bad suggestion doesn't discard all valid ones
    if (itemErrors.length === 0) {
      suggestions.push({
        category: item.category as RefinementCategory,
        target_section: item.target_section as string,
        current_state: item.current_state as string,
        suggested_change: item.suggested_change as string,
        evidence: item.evidence as string,
        confidence: item.confidence as ConfidenceLevel,
        expected_impact: item.expected_impact as string,
        compliance_review_required: item.compliance_review_required === true,
      });
    }
  }

  if (suggestions.length === 0 && errors.length > 0) {
    return { valid: false, errors };
  }

  if (suggestions.length < 3) {
    // Warn but still valid — some orgs may have limited data
    return {
      valid: true,
      errors: [
        `Only ${suggestions.length} suggestion(s) generated. Expected 3–7. This may indicate insufficient data.`,
      ],
      suggestions,
    };
  }

  return { valid: true, errors: [], suggestions };
}

// ─── Benchmark data ───────────────────────────────────────────

/**
 * Format industry CAC benchmark data as a prompt-ready string.
 * Uses the same CAC_DATA from bullseye.ts — single source of truth.
 * Safe for serverless (no fs.readFileSync).
 */
export function getIndustryBenchmarks(industry: string): string {
  const data = CAC_DATA[industry];
  if (!data || data.length === 0) {
    return "No industry-specific CAC benchmark data available. Use general marketing knowledge for channel comparisons.";
  }

  const lines = data.map(
    (channel) =>
      `- ${channel.channel}: median CAC $${channel.median} (bootstrap: ${channel.bootstrap})`,
  );

  return `Industry: ${industry.replace(/_/g, " ")}\n\n${lines.join("\n")}\n\nNote: CAC data last verified January 2025. Treat as directional, not absolute.`;
}

// ─── Correction prompt ────────────────────────────────────────

/**
 * Build a correction prompt for a retry attempt.
 */
export function buildRefinerCorrectionPrompt(
  originalOutput: string,
  errors: string[],
): string {
  return `Your previous refinement output had issues:

${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}

Your previous output was:
${originalOutput}

Please output a corrected JSON array of refinement suggestions. Each suggestion must have exactly these 7 fields: category, target_section, current_state, suggested_change, evidence, confidence, expected_impact.

Respond ONLY with a valid JSON array, no markdown fences or extra text.`;
}
