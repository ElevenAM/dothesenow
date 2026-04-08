/**
 * Task Decomposer — converts a GACCS strategy document into a prioritized daily task list.
 *
 * All heuristics sourced from: packages/prompts/reference/task-decomposer-reference.md
 */
import type {
  DecompositionContext,
  DecomposedTask,
  DecompositionValidationResult,
  YesterdayOutcome,
  ChannelBalanceEntry,
  TeamMember,
} from "./types.js";

const INDUSTRY_COMPLIANCE: Record<string, string> = {
  fintech: `COMPLIANCE: ROI claims need documented substantiation. Include 3-5 business day compliance buffer for Risk Tier 2-3 content.`,
  healthtech: `COMPLIANCE: Clinical claims need medical review. Include 5-8 business day HIPAA review buffer.`,
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const DAY_PATTERNS: Record<string, string> = {
  Monday: "Planning + setup — review last week's metrics, plan this week's content",
  Tuesday: "Content creation — peak creative energy; writing, design, video",
  Wednesday: "Content creation + outreach — publishing, email sends, partner outreach",
  Thursday: "Distribution + engagement — share content, engage on social, respond to comments",
  Friday: "Analysis + optimization — end-of-week review; check metrics, update experiments",
  Saturday: "Light engagement only — social monitoring, community responses",
  Sunday: "Rest day — no tasks generated",
};

const EXECUTOR_HEURISTICS = `Executor assignment rules:
- Writing/content drafts → claude_api (LLM excels at first drafts)
- Writing final edits → self (human judgment for voice/tone)
- Research and data gathering → claude_api
- Social media posting → self (personal) or n8n (scheduled)
- Email campaign setup → self (requires ESP tool interaction)
- Design tasks → freelancer or self
- Analytics/metric review → self (requires dashboard interpretation)
- Automation setup → n8n
- Ad campaign management → self (requires ad platform interaction)
- If org has a BYOS executor for a capability, prefer it over claude_api`;

const DURATION_REFERENCE = `Duration estimates (defaults):
- Blog post draft (1-2K words): 90 min
- Repurpose blog → 3 social posts: 20 min
- Social media post: 15 min
- Cold outreach batch (20 emails): 60 min
- Research/keyword analysis: 45 min
- Email copy (single): 30 min
- Analytics dashboard review: 20 min
- Ad campaign setup: 60 min
- Design review/feedback: 20 min
- Community engagement: 30 min
- Publish/distribute content: 15 min
- Strategic planning/weekly review: 45 min`;

// ─── Public API ──────────────────────────────────────────────

export function assembleDecompositionPrompt(
  ctx: DecompositionContext,
): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: buildSystemPrompt(ctx),
    userPrompt: buildUserPrompt(ctx),
  };
}

export function validateDecompositionOutput(
  raw: string,
  budgetTier: string,
  teamSize: number = 1,
  dayOfWeek: number = 1,
): DecompositionValidationResult {
  // Sunday: no tasks expected
  if (dayOfWeek === 0) {
    return { valid: true, errors: [], tasks: [] };
  }

  const cleaned = cleanJsonOutput(raw);
  const errors: string[] = [];

  let tasks: DecomposedTask[];
  try {
    tasks = JSON.parse(cleaned);
  } catch {
    return { valid: false, errors: ["Output is not valid JSON"], tasks: [] };
  }

  if (!Array.isArray(tasks)) {
    return {
      valid: false,
      errors: ["Output must be a JSON array"],
      tasks: [],
    };
  }

  const { min, max } = getTaskBounds(budgetTier, teamSize, dayOfWeek);
  if (tasks.length < min) {
    errors.push(`Too few tasks: got ${tasks.length}, need at least ${min}`);
  }
  if (tasks.length > max) {
    errors.push(`Too many tasks: got ${tasks.length}, maximum is ${max}`);
  }

  const maxHours = getMaxDailyHours(budgetTier, teamSize);
  const totalMinutes = tasks.reduce(
    (sum, t) => sum + (t.duration_minutes ?? 0),
    0,
  );
  if (totalMinutes > maxHours * 60) {
    errors.push(
      `Total duration ${totalMinutes}min exceeds ${maxHours}h daily limit for ${budgetTier} tier`,
    );
  }

  const verbPattern = /^[A-Z][a-z]+\s/;
  const validExecutors = [
    "self",
    "claude_api",
    "n8n",
    "freelancer",
    "byos",
  ];

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (!t.title) {
      errors.push(`Task ${i + 1}: missing title`);
    } else if (!verbPattern.test(t.title)) {
      errors.push(
        `Task ${i + 1}: title must start with a verb ("${t.title.slice(0, 30)}...")`,
      );
    }
    if (!t.description) errors.push(`Task ${i + 1}: missing description`);
    if (
      typeof t.duration_minutes !== "number" ||
      t.duration_minutes <= 0 ||
      t.duration_minutes > 180
    ) {
      errors.push(
        `Task ${i + 1}: duration_minutes must be 1-180, got ${t.duration_minutes}`,
      );
    }
    if (!t.executor_type || !validExecutors.includes(t.executor_type)) {
      errors.push(
        `Task ${i + 1}: invalid executor_type "${t.executor_type}"`,
      );
    }
    if (!t.strategy_section_ref) {
      errors.push(`Task ${i + 1}: missing strategy_section_ref`);
    }
  }

  return { valid: errors.length === 0, errors, tasks };
}

export function buildDecompositionCorrectionPrompt(
  output: string,
  errors: string[],
): string {
  return `Your previous output had issues. Fix these specific problems:

${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}

Regenerate the COMPLETE task list as a valid JSON array, fixing all issues above. Keep the good content but ensure the structure is correct.

Your previous output:
${output}`;
}

// ─── Prompt builders ────────────────────────────────────────

function buildSystemPrompt(ctx: DecompositionContext): string {
  const compliance = INDUSTRY_COMPLIANCE[ctx.org.industry] ?? "";

  return `You are a marketing operations assistant for DoTheseNow, a marketing task management platform. Your job is to create today's prioritized task list for a ${ctx.org.industry.replace(/_/g, " ")} marketing team on a ${ctx.org.budgetTier} budget.

You convert strategy documents into specific, actionable daily tasks. Every task title MUST start with a verb. Tasks must be specific enough that someone can execute them without asking follow-up questions.

CONSTRAINTS:
- Output ONLY a JSON array. No markdown, no explanation, no code fences.
- Every task must have: title, description, duration_minutes, priority (1=highest), executor_type, strategy_section_ref, experiment_id (null if not from backlog), recommended_assignee_role (null for solo founders).
- Total duration must not exceed the daily limit for this budget tier.
${compliance ? `\n${compliance}` : ""}`;
}

function buildUserPrompt(ctx: DecompositionContext): string {
  const dayName = DAY_NAMES[ctx.dayOfWeek];
  const { min, max } = getTaskBounds(
    ctx.org.budgetTier,
    ctx.org.teamSize,
    ctx.dayOfWeek,
  );
  const maxHours = getMaxDailyHours(ctx.org.budgetTier, ctx.org.teamSize);

  const sections: string[] = [];

  // Org context
  sections.push(`## Context
- Company: ${ctx.org.name}
- Industry: ${ctx.org.industry.replace(/_/g, " ")}
- Budget tier: ${ctx.org.budgetTier}
- Team size: ${ctx.org.teamSize}
- Today: ${dayName}, ${ctx.targetDate}`);

  // Day pattern
  sections.push(`## Today's Focus
${dayName}: ${DAY_PATTERNS[dayName]}`);

  // Active strategy summary (truncated to key sections)
  const channels = extractChannelAllocations(ctx.strategyContent);
  const currentPhase = extractCurrentPhase(ctx.strategyContent);
  const experiments = extractTopExperiments(ctx.strategyContent, 10);

  sections.push(`## Active Strategy
${channels.length > 0 ? `Channels: ${channels.map((c) => `${c.name} (${c.pct}%)`).join(", ")}` : ""}
${currentPhase ? `Current phase: ${currentPhase}` : ""}

Top experiments (by ICE score):
${experiments.map((e, i) => `${i + 1}. ${e.title} (ICE: ${e.ice})`).join("\n")}`);

  // Yesterday's outcomes
  if (ctx.yesterdayOutcomes.length > 0) {
    sections.push(`## Yesterday's Outcomes
${formatCarryOverItems(ctx.yesterdayOutcomes)}`);
  }

  // Channel balance
  if (ctx.channelBalance.length > 0) {
    sections.push(`## Channel Balance (last 5 days)
${ctx.channelBalance.map((c) => `- ${c.channel}: target ${c.targetPct}%, actual ${c.actualPct}%${c.actualPct < c.targetPct * 0.7 ? " ⚠ UNDER-REPRESENTED" : ""}`).join("\n")}`);
  }

  // Experiment progress
  if (ctx.experimentProgress.length > 0) {
    sections.push(`## Experiment Progress
${ctx.experimentProgress.map((e) => `- ${e.experimentTitle}: ${e.completedSteps}/${e.totalEstimatedSteps} steps done`).join("\n")}`);
  }

  // Team roster
  if (ctx.team.length > 1) {
    sections.push(`## Team Roster
${formatTeamRoster(ctx.team)}
For each task, set recommended_assignee_role to the best-matching specialty from the roster above. If no specialty matches, use null.`);
  }

  // Rules
  const soloNote =
    ctx.org.teamSize === 1
      ? `\nSolo founder mode: max 2 focused tasks (30-90 min) + ${max - 2} lightweight tasks (≤15 min). Friday = 1 focused task (weekly metrics review).`
      : "";

  sections.push(`## Rules
1. Generate ${min}-${max} tasks
2. Total duration must not exceed ${maxHours} hours (${maxHours * 60} minutes)
3. Every task title starts with a verb
4. Follow today's day-of-week pattern (${dayName})
5. Carry forward logic applied to yesterday's outcomes
6. Prioritize under-represented channels
7. Include strategy_section_ref (e.g., "Channels.ContentSEO", "ExperimentBacklog.3") and experiment_id for each task${soloNote}

${EXECUTOR_HEURISTICS}

${DURATION_REFERENCE}

Output as a JSON array: [{ "title", "description", "duration_minutes", "priority", "executor_type", "strategy_section_ref", "experiment_id", "recommended_assignee_role" }]`);

  return sections.join("\n\n");
}

// ─── Helpers ────────────────────────────────────────────────

interface ChannelAlloc {
  name: string;
  pct: number;
}

export function extractChannelAllocations(content: string): ChannelAlloc[] {
  const results: ChannelAlloc[] = [];

  // Format 1: "Budget: XX%" or "Budget %: XX"
  const budgetPattern =
    /\*\*([^*]+)\*\*.*?(?:Budget[^:]*:\s*(\d+)%|(\d+)%\s*(?:of\s+)?budget)/gi;
  let match: RegExpExecArray | null;
  while ((match = budgetPattern.exec(content)) !== null) {
    const pct = parseInt(match[2] ?? match[3], 10);
    if (!isNaN(pct) && pct > 0) {
      results.push({ name: match[1].trim(), pct });
    }
  }

  // Format 2: numbered channels "1. **Name** — ..." (from onboarding templates, no budget %)
  if (results.length === 0) {
    const numberedPattern = /^\d+\.\s+\*\*([^*]+)\*\*/gm;
    const channelSection = extractSection(content, "Channels");
    if (channelSection) {
      const names: string[] = [];
      while ((match = numberedPattern.exec(channelSection)) !== null) {
        names.push(match[1].trim());
      }
      if (names.length > 0) {
        const equalPct = Math.floor(100 / names.length);
        for (const name of names) {
          results.push({ name, pct: equalPct });
        }
      }
    }
  }

  return results;
}

export function extractCurrentPhase(content: string): string | null {
  // Look for ### Months X-Y headings in Strategy/Schedule section
  const scheduleSection =
    extractSection(content, "Schedule") ??
    extractSection(content, "Strategy");
  if (!scheduleSection) return null;

  const phasePattern = /###?\s+(Months?\s+\d[\d–-]+\d)[:\s]*([^\n]*)/gi;
  const phases: { heading: string; theme: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = phasePattern.exec(scheduleSection)) !== null) {
    phases.push({ heading: m[1].trim(), theme: m[2]?.trim() ?? "" });
  }

  // Simple heuristic: if we have 3 phases, pick based on rough month mapping
  // Months 1-2 → first 60 days, Months 3-4 → 60-120 days, Months 5-6 → 120-180 days
  if (phases.length === 0) return null;
  // Default to first phase (most orgs are in early execution)
  const phase = phases[0];
  return phase.theme
    ? `${phase.heading}: ${phase.theme}`
    : phase.heading;
}

interface ExperimentRow {
  title: string;
  ice: number;
}

export function extractTopExperiments(
  content: string,
  limit: number,
): ExperimentRow[] {
  const section = extractSection(content, "Experiment Backlog");
  if (!section) return [];

  const results: ExperimentRow[] = [];
  // Parse markdown table rows: | Title | Impact | Confidence | Ease | ICE |
  const rows = section.split("\n").filter(
    (line) =>
      line.startsWith("|") &&
      !line.includes("---") &&
      !line.toLowerCase().includes("experiment") &&
      !line.toLowerCase().includes("impact"),
  );

  for (const row of rows) {
    const cells = row
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length >= 5) {
      const ice = parseInt(cells[4], 10);
      if (!isNaN(ice)) {
        results.push({ title: cells[0], ice });
      }
    }
  }

  // Sort by ICE descending
  results.sort((a, b) => b.ice - a.ice);
  return results.slice(0, limit);
}

function formatCarryOverItems(outcomes: YesterdayOutcome[]): string {
  return outcomes
    .map((o) => {
      let action: string;
      switch (o.status) {
        case "completed":
          action = "COMPLETED — move to next step or experiment";
          break;
        case "failed":
          action = o.failureReason
            ? `FAILED (${o.failureReason}) — ${o.failureReason === "blocker" ? "skip, blocker system handles" : "retry with same or different executor, priority +1"}`
            : "FAILED — retry with priority +1";
          break;
        case "skipped":
          action =
            (o.daysCarried ?? 0) >= 2
              ? "SKIPPED 2+ days — deprioritize"
              : "SKIPPED — include tomorrow with same priority";
          break;
        case "carried_over":
          action =
            (o.daysCarried ?? 0) >= 3
              ? "CARRIED 3+ days — flag for review, consider dropping"
              : "CARRIED OVER — include today with priority +1";
          break;
        default:
          action = `${o.status.toUpperCase()} — include today`;
      }
      return `- "${o.title}" [${o.executorType}]: ${action}`;
    })
    .join("\n");
}

function formatTeamRoster(team: TeamMember[]): string {
  return team
    .map((m) => {
      const name = m.displayName ?? "Team member";
      const specs =
        m.specialties.length > 0
          ? `specialties: ${m.specialties.join(", ")}`
          : "no specialties set";
      return `- ${name} (${specs}) [role: ${m.role}]`;
    })
    .join("\n");
}

function getTaskBounds(
  budgetTier: string,
  teamSize: number,
  dayOfWeek: number,
): { min: number; max: number } {
  // Sunday: no tasks
  if (dayOfWeek === 0) return { min: 0, max: 0 };

  // Saturday: light engagement only
  if (dayOfWeek === 6) return { min: 1, max: 2 };

  // Solo founder mode
  if (teamSize === 1 && budgetTier === "bootstrap") {
    // Friday = review only
    if (dayOfWeek === 5) return { min: 1, max: 2 };
    return { min: 3, max: 5 }; // 1-2 focused + 2-3 lightweight
  }

  // Standard tier bounds
  switch (budgetTier) {
    case "bootstrap":
      return { min: 3, max: 5 };
    case "growth":
      return { min: 4, max: 6 };
    case "scale":
      return { min: 5, max: 7 };
    default:
      return { min: 3, max: 5 };
  }
}

function getMaxDailyHours(budgetTier: string, teamSize: number): number {
  // Solo founder: 1.5-2 hours for marketing
  if (teamSize === 1 && budgetTier === "bootstrap") return 2;

  switch (budgetTier) {
    case "bootstrap":
      return 4;
    case "growth":
      return 5;
    case "scale":
      return 6;
    default:
      return 4;
  }
}

function extractSection(content: string, sectionName: string): string | null {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `^##\\s+${escaped}[\\s\\S]*?(?=^##\\s+(?!#)|$)`,
    "m",
  );
  const match = content.match(pattern);
  return match ? match[0] : null;
}

/** Strip markdown code fences that LLMs sometimes wrap JSON in. */
function cleanJsonOutput(raw: string): string {
  let cleaned = raw.trim();
  // Remove ```json ... ``` or ``` ... ```
  const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const fenceMatch = cleaned.match(fencePattern);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  return cleaned;
}
