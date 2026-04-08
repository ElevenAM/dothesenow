import type { DailyTask } from "./domain.js";
import type { Json } from "./database.js";

// ─── Executor Categories & Capabilities ─────────────────────

export type ExecutorCategory = "builtin" | "byos" | "webhook";

export type ExecutorCapability =
  | "content_generation"
  | "research"
  | "automation"
  | "outreach"
  | "analytics";

// ─── Config Schema (drives dynamic settings UI) ─────────────

export interface ExecutorConfigField {
  key: string;
  label: string;
  type: "secret" | "url" | "select" | "text";
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

// ─── Task Dispatch Types ─────────────────────────────────────

export type DispatchableTask = Pick<
  DailyTask,
  | "id"
  | "org_id"
  | "title"
  | "description"
  | "task_type"
  | "priority"
  | "executor_type"
  | "executor_config"
  | "department_id"
  | "scheduled_date"
  | "source_strategy"
  | "campaign_id"
  | "contact_id"
>;

export interface ExecutorRuntimeConfig {
  integration: OrgIntegration | null;
  secret: string | null;
  callbackUrl: string;
}

// ─── Org Integration (dtn_org_integrations row) ─────────────

export interface OrgIntegration {
  id: string;
  org_id: string;
  integration_type: string;
  config: Json;
  vault_secret_id: string | null;
  is_active: boolean;
  connected_at: string;
  connected_by: string | null;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Executor Metadata (serializable, safe for client) ──────

export interface ExecutorMetadata {
  type: string;
  label: string;
  category: ExecutorCategory;
  icon: string;
  description: string;
  configSchema: ExecutorConfigField[];
  capabilities: ExecutorCapability[];
}

// ─── Executor Definition (server-only, has functions) ────────

export interface ExecutorDefinition extends ExecutorMetadata {
  checkAvailability: (
    orgIntegrations: OrgIntegration[],
  ) => { available: boolean; hint?: string };
  dispatch: (
    task: DispatchableTask,
    config: ExecutorRuntimeConfig,
  ) => Promise<void>;
  estimateCredits: (task: DispatchableTask) => number;
  testConnection?: (secret: string, config: Json) => Promise<void>;
}
