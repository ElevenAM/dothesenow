import type { Industry, BudgetTier } from "@dothesenow/types";

/** Credits consumed per strategy generation. Shared between server action and Inngest function. */
export const STRATEGY_GENERATION_COST = 5;

export type FrameworkId =
  | "bullseye"
  | "gaccs"
  | "ice"
  | "aarrr"
  | "growth_matrix";

export interface OrgProfile {
  industry: Industry;
  budgetTier: BudgetTier;
  stage: string | null;
  growthMotion: string | null;
  name: string;
  productDescription?: string | null;
  valueProposition?: string | null;
  websiteUrl?: string | null;
  targetCustomer?: string | null;
}

export interface PromptFragment {
  frameworkId: FrameworkId;
  content: string;
  order: number;
}

export interface GenerationMetadata {
  status:
    | "pending"
    | "generating"
    | "validating"
    | "completed"
    | "completed_with_warnings"
    | "failed";
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  frameworksSelected?: FrameworkId[];
  validationErrors?: string[];
  retryCount?: number;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Chat & Agent Execution ────────────────────────────────

/** Credits consumed per chat message. */
export const CHAT_MESSAGE_COST = 1;

/** Credits consumed per agent task execution. */
export const AGENT_EXECUTION_COST = 1;

// ─── Blocker Resolution ─────────────────────────────────────

/** Credits consumed per blocker classification. */
export const BLOCKER_CLASSIFICATION_COST = 1;

/** Credits consumed per blocker research resolution. */
export const BLOCKER_RESEARCH_COST = 1;

/** Credits consumed per blocker draft resolution. */
export const BLOCKER_DRAFT_COST = 1;

// ─── Task Decomposition ─────────────────────────────────────

/** Credits consumed per daily task decomposition. */
export const TASK_DECOMPOSITION_COST = 1;

export interface TeamMember {
  userId: string;
  displayName: string | null;
  specialties: string[];
  role: string;
}

export interface DecompositionContext {
  org: OrgProfile & { teamSize: number; timezone: string | null };
  strategyDocId: string;
  strategyContent: string;
  yesterdayOutcomes: YesterdayOutcome[];
  channelBalance: ChannelBalanceEntry[];
  experimentProgress: ExperimentProgressEntry[];
  team: TeamMember[];
  targetDate: string;
  dayOfWeek: number; // 0=Sunday, 6=Saturday
}

export interface YesterdayOutcome {
  taskId: string;
  title: string;
  status: string;
  executorType: string;
  strategySection: string | null;
  experimentId: string | null;
  failureReason?: string;
  daysCarried?: number;
}

export interface ChannelBalanceEntry {
  channel: string;
  targetPct: number;
  actualPct: number;
}

export interface ExperimentProgressEntry {
  experimentId: string;
  experimentTitle: string;
  completedSteps: number;
  totalEstimatedSteps: number;
}

export interface DecomposedTask {
  title: string;
  description: string;
  duration_minutes: number;
  priority: number;
  executor_type: string;
  strategy_section_ref: string;
  experiment_id: string | null;
  recommended_assignee_role: string | null;
}

export interface DecompositionValidationResult {
  valid: boolean;
  errors: string[];
  tasks: DecomposedTask[];
}

// ─── Strategy Refinement ────────────────────────────────────

/** Credits consumed per strategy refinement run. */
export const STRATEGY_REFINEMENT_COST = 4;

export type RefinementCategory =
  | "channel_swap"
  | "budget_realloc"
  | "experiment_add"
  | "experiment_kill"
  | "goal_adjust"
  | "audience_refine";

export type ConfidenceLevel = "high" | "medium" | "low";

export type SuggestionApplyStatus = "applied" | "fallback" | "failed" | "skipped";

export interface RefinementSuggestion {
  category: RefinementCategory;
  target_section: string;
  current_state: string;
  suggested_change: string;
  evidence: string;
  confidence: ConfidenceLevel;
  expected_impact: string;
  compliance_review_required?: boolean;
}

export interface ExperimentOutcome {
  experiment_id: string;
  title: string;
  status: string;
  result: "success" | "failure" | "inconclusive" | "running";
  metric_value: number | null;
  baseline_value: number | null;
  success_target: number | null;
  data_points: number;
}

export interface RedFlag {
  type:
    | "zero_activity"
    | "total_failure"
    | "budget_overspend"
    | "experiment_stuck";
  channel_or_experiment: string;
  detail: string;
  days: number;
}

export interface PerformanceData {
  total_tasks: number;
  completion_rate: number;
  channel_breakdown: ChannelPerformanceWithGaps[];
  experiments: ExperimentOutcome[];
  experiments_in_progress: ExperimentProgressEntry[];
  red_flags: RedFlag[];
  period_start: string;
  period_end: string;
  days_of_data: number;
}

/**
 * Extends 9A's ChannelPerformanceRow with gap-detection fields
 * needed by the refinement pipeline.
 */
export interface ChannelPerformanceWithGaps {
  strategy_section_ref: string;
  total_tasks: number;
  completed: number;
  failed: number;
  skipped: number;
  completion_rate: number;
  days_active: number;
  consecutive_zero_days: number;
}

// ─── Budget Tier Helpers ──────────────────────────────────────

/** Maximum number of marketing channels for a given budget tier. */
export function getMaxChannels(budgetTier: string): number {
  if (budgetTier === "bootstrap") return 3;
  if (budgetTier === "growth") return 5;
  return 7;
}
