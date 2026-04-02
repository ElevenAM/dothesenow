export interface PipelineRow {
  lifecycle_stage: string;
  contact_type: string;
  count: number;
  engaged_last_7d: number;
  engaged_last_30d: number;
  avg_lead_score: number;
}

export const STAGE_ORDER = [
  "awareness",
  "consideration",
  "decision",
  "customer",
  "advocate",
] as const;

export const STAGE_LABELS: Record<string, string> = {
  awareness: "Awareness",
  consideration: "Consideration",
  decision: "Decision",
  customer: "Customer",
  advocate: "Advocate",
};
