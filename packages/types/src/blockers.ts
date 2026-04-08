// ─── Blocker Type Classification ────────────────────────────────

export const BlockerType = {
  KnowledgeGap: "knowledge_gap",
  Dependency: "dependency",
  SkillGap: "skill_gap",
  ResourceConstraint: "resource_constraint",
  DecisionNeeded: "decision_needed",
} as const;
export type BlockerType = (typeof BlockerType)[keyof typeof BlockerType];

// ─── Resolution Lifecycle ───────────────────────────────────────

export const BlockerResolutionStatus = {
  Reported: "reported",
  Classifying: "classifying",
  Classified: "classified",
  Resolving: "resolving",
  Resolved: "resolved",
  Escalated: "escalated",
  Dismissed: "dismissed",
  Failed: "failed",
} as const;
export type BlockerResolutionStatus =
  (typeof BlockerResolutionStatus)[keyof typeof BlockerResolutionStatus];

// ─── Resolution Routing ─────────────────────────────────────────

export const BlockerRoute = {
  ResearchAgent: "research_agent",
  Escalation: "escalation",
  DraftAgent: "draft_agent",
  Replan: "replan",
  ApprovalQueue: "approval_queue",
} as const;
export type BlockerRoute = (typeof BlockerRoute)[keyof typeof BlockerRoute];

/** Maps each blocker type to its resolution strategy. */
export const BLOCKER_ROUTING: Record<BlockerType, BlockerRoute> = {
  knowledge_gap: BlockerRoute.ResearchAgent,
  dependency: BlockerRoute.Escalation,
  skill_gap: BlockerRoute.DraftAgent,
  resource_constraint: BlockerRoute.Replan,
  decision_needed: BlockerRoute.ApprovalQueue,
};

// ─── Domain Interfaces ──────────────────────────────────────────

export interface Blocker {
  id: string;
  task_id: string;
  org_id: string;
  description: string;
  reported_by: string | null;
  blocker_type: BlockerType | null;
  blocker_type_secondary: BlockerType | null;
  classification_confidence: number | null;
  classification_reasoning: string | null;
  resolution_status: BlockerResolutionStatus;
  resolution_output: string | null;
  resolution_metadata: Record<string, unknown>;
  resolved_at: string | null;
  resolved_by: string | null;
  escalation_level: number;
  last_escalated_at: string | null;
  inngest_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportBlockerInput {
  task_id: string;
  description: string;
}

export interface BlockerClassificationResult {
  blocker_type: BlockerType;
  blocker_type_secondary: BlockerType | null;
  confidence: number;
  reasoning: string;
}

export interface ResearchResult {
  findings: string[];
  sources: string[];
  recommended_action: string;
  confidence: number;
}

export interface DraftResult {
  draft_type: string;
  content: string;
  usage_instructions: string;
  alternative_approaches: string[];
}
