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

// ─── Budget Tier Helpers ──────────────────────────────────────

/** Maximum number of marketing channels for a given budget tier. */
export function getMaxChannels(budgetTier: string): number {
  if (budgetTier === "bootstrap") return 3;
  if (budgetTier === "growth") return 5;
  return 7;
}
