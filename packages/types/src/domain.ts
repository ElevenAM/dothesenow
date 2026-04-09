import type {
  TaskStatus,
  Priority,
  TaskType,
  ExecutorType,
  ExperimentStatus,
  GeneratedBy,
  ContactType,
  ContactStatus,
  CreditStatus,
  LifecycleStage,
  OutreachChannel,
  OutreachDirection,
  OutreachStatus,
  DocType,
  ApprovalItemType,
  ApprovalStatus,
  SubmittedByType,
  MemberRole,
  MarketplaceTaskStatus,
  SubmissionStatus,
  EngagementType,
  PaymentType,
  MessageSenderType,
  CampaignType,
  CampaignStatus,
} from "./enums.js";
import type { Json } from "./database.js";

// ─── Daily Tasks ─────────────────────────────────────────────

export interface DailyTask {
  id: string;
  org_id: string;
  department_id: string | null;
  created_by: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  task_type: TaskType;
  priority: Priority;
  executor_type: ExecutorType;
  executor_config: Json | null;
  mktg_task_id: string | null;
  status: TaskStatus;
  scheduled_date: string;
  outcome_notes: string | null;
  completed_at: string | null;
  source_strategy: string | null;
  strategy_doc_id: string | null;
  strategy_section_ref: string | null;
  experiment_id: string | null;
  duration_minutes: number | null;
  recommended_assignee_role: string | null;
  campaign_id: string | null;
  contact_id: string | null;
  generated_by: GeneratedBy;
  generation_context: Json;
  created_at: string;
  updated_at: string;
}

export interface DailyTaskWithProfiles extends DailyTask {
  assigned_profile?: { display_name: string | null; email: string } | null;
  creator_profile?: { display_name: string | null; email: string } | null;
}

export interface DailyTasksSummary {
  executor_type: string;
  total: number;
  completed: number;
  pending: number;
  in_progress: number;
  failed: number;
}

// ─── Contacts / CRM ─────────────────────────────────────────

export interface Contact {
  id: string;
  org_id: string;
  owner_id: string | null;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  contact_type: ContactType;
  status: ContactStatus;
  lifecycle_stage: LifecycleStage;
  tags: string[];
  location: string | null;
  source: string | null;
  persona: string | null;
  lead_score: number;
  last_engaged: string | null;
  notes: string | null;
  external_ids: Record<string, string>;
  external_updated_at: string | null;
  sync_status: string;
  created_at: string;
  updated_at: string;
}

export interface OutreachEntry {
  id: string;
  org_id: string;
  contact_id: string;
  campaign_id: string | null;
  channel: OutreachChannel;
  direction: OutreachDirection;
  subject: string | null;
  content: string | null;
  status: OutreachStatus | null;
  persona_used: string | null;
  sent_at: string | null;
  response_at: string | null;
  notes: string | null;
  created_at: string;
}

// ─── Strategy Docs ───────────────────────────────────────────

export interface StrategyDoc {
  id: string;
  org_id: string;
  doc_type: DocType;
  title: string;
  content: string;
  version: number;
  tags: string[];
  previous_version_id: string | null;
  change_summary: string | null;
  changed_by: string | null;
  is_active: boolean;
  embedding: string | null;
  generation_metadata: Json | null;
  created_at: string;
  updated_at: string;
}

// ─── Approval Queue ──────────────────────────────────────────

export interface ApprovalItem {
  id: string;
  org_id: string;
  department_id: string | null;
  item_type: ApprovalItemType;
  title: string;
  content: string;
  metadata: Json | null;
  submitted_by_type: SubmittedByType;
  submitted_by_id: string | null;
  assigned_reviewer: string | null;
  daily_task_id: string | null;
  status: ApprovalStatus;
  reviewer_notes: string | null;
  reviewed_at: string | null;
  publish_config: Json | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalItemWithTask extends ApprovalItem {
  daily_task?: {
    title: string;
    task_type: string;
    description?: string;
    priority?: string;
    executor_type?: string;
  } | null;
  reviewer_profile?: { display_name: string | null; email: string } | null;
}

export interface ApprovalStats {
  pending: number;
  approved_7d: number;
  rejected_7d: number;
}

// ─── Organizations ───────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  plan_status: string;
  logo_url: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  settings: Json | null;
  industry: string | null;
  stage: string | null;
  budget_tier: string | null;
  growth_motion: string | null;
  timezone: string | null;
  onboarding_completed_at: string | null;
  ai_credits_remaining: number;
  ai_credits_reset_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Credit Ledger ──────────────────────────────────────────

export interface CreditLedgerEntry {
  id: string;
  org_id: string;
  amount: number;
  balance_after: number;
  reason: string;
  status: CreditStatus;
  reference_id: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Memberships ─────────────────────────────────────────────

export interface Membership {
  id: string;
  org_id: string;
  user_id: string | null;
  role: MemberRole;
  specialties: string[];
  is_active: boolean;
  invited_email: string | null;
  invited_by: string | null;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
}

// ─── Departments ─────────────────────────────────────────────

export interface Department {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  icon: string | null;
  is_active: boolean;
  created_at: string;
}

// ─── Input types for mutations ───────────────────────────────

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  task_type?: TaskType;
  priority?: Priority;
  executor_type?: ExecutorType;
  executor_config?: Json | null;
  scheduled_date?: string;
  department_id?: string | null;
  assigned_to?: string | null;
  source_strategy?: string | null;
  strategy_doc_id?: string | null;
  strategy_section_ref?: string | null;
  experiment_id?: string | null;
  duration_minutes?: number | null;
  recommended_assignee_role?: string | null;
  campaign_id?: string | null;
  contact_id?: string | null;
  generated_by?: GeneratedBy | null;
  generation_context?: Json | null;
}

/** Field updates. Pass `status` to trigger a state-machine transition via transitionTaskStatus(). */
export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  task_type?: TaskType;
  priority?: Priority;
  status?: TaskStatus;
  executor_type?: ExecutorType;
  executor_config?: Json | null;
  scheduled_date?: string;
  outcome_notes?: string | null;
  assigned_to?: string | null;
}

export interface CreateContactInput {
  first_name: string;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  contact_type?: ContactType;
  status?: ContactStatus;
  lifecycle_stage?: LifecycleStage | null;
  tags?: string[] | null;
  location?: string | null;
  source?: string | null;
  persona?: string | null;
  notes?: string | null;
}

export interface UpdateContactInput {
  first_name?: string;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  contact_type?: ContactType;
  status?: ContactStatus;
  lifecycle_stage?: LifecycleStage | null;
  tags?: string[] | null;
  location?: string | null;
  source?: string | null;
  persona?: string | null;
  lead_score?: number | null;
  notes?: string | null;
  external_ids?: Record<string, string>;
  external_updated_at?: string | null;
  sync_status?: string;
}

export interface CreateStrategyDocInput {
  doc_type: DocType;
  title: string;
  content: string;
  tags?: string[] | null;
  changed_by?: string | null;
}

export interface UpdateStrategyDocInput {
  title?: string;
  content?: string;
  tags?: string[] | null;
  change_summary?: string | null;
  changed_by?: string | null;
  is_active?: boolean;
}

export interface CreateApprovalInput {
  item_type: ApprovalItemType;
  title: string;
  content: string;
  metadata?: Json | null;
  submitted_by_type: SubmittedByType;
  submitted_by_id?: string | null;
  daily_task_id?: string | null;
  department_id?: string | null;
  assigned_reviewer?: string | null;
}

export interface ReviewApprovalInput {
  status: ApprovalStatus;
  reviewer_notes?: string | null;
  publish_config?: Json | null;
}

export interface LogOutreachInput {
  contact_id: string;
  channel: OutreachChannel;
  direction?: OutreachDirection;
  subject?: string | null;
  content?: string | null;
  status?: OutreachStatus | null;
  persona_used?: string | null;
  sent_at?: string | null;
  campaign_id?: string | null;
  notes?: string | null;
}

// ─── Marketplace ────────────────────────────────────────────

export interface MarketplaceTask {
  id: string;
  org_id: string;
  title: string;
  description: string;
  task_type: string;
  required_skills: string[] | null;
  min_experience: string | null;
  deliverables: string | null;
  brief: string;
  brand_guidelines: string | null;
  reference_materials: string | null;
  engagement_type: EngagementType | null;
  budget: number | null;
  payment_type: PaymentType | null;
  priority: Priority | null;
  status: MarketplaceTaskStatus;
  assigned_to: string | null;
  campaign_id: string | null;
  due_date: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  generated_by_ai: boolean | null;
  source_strategy: string | null;
  created_at: string | null;
  updated_at: string | null;
  freelancer?: Freelancer | null;
}

export interface MarketplaceTaskSubmission {
  id: string;
  org_id: string;
  task_id: string;
  freelancer_id: string;
  content: string | null;
  file_urls: string[] | null;
  notes: string | null;
  status: SubmissionStatus;
  reviewer_notes: string | null;
  ai_review: string | null;
  rating: number | null;
  submitted_at: string | null;
  reviewed_at: string | null;
}

export interface Freelancer {
  id: string;
  org_id: string;
  name: string;
  email: string;
  portfolio_url: string | null;
  skills: string[] | null;
  specialties: string[] | null;
  experience_level: string | null;
  hourly_rate: number | null;
  currency: string | null;
  tasks_completed: number | null;
  avg_rating: number | null;
  reliability_score: number | null;
  engagement_type: EngagementType | null;
  available: boolean | null;
  nda_signed: boolean | null;
  clearance_level: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type FreelancerLeaderboardEntry = Pick<Freelancer,
  "id" | "org_id" | "name" | "email" | "skills" | "engagement_type" |
  "tasks_completed" | "avg_rating" | "reliability_score" | "available"
>;

export interface TaskMessage {
  id: string;
  org_id: string;
  task_id: string;
  sender_type: MessageSenderType;
  sender_id: string | null;
  content: string;
  includes_strategy_context: boolean | null;
  created_at: string | null;
}

export interface CreateMarketplaceTaskInput {
  title: string;
  description?: string;
  task_type: string;
  brief: string;
  brand_guidelines?: string | null;
  reference_materials?: string | null;
  required_skills?: string[] | null;
  deliverables?: string | null;
  engagement_type?: EngagementType;
  budget?: number | null;
  payment_type?: PaymentType;
  priority?: Priority;
  due_date?: string | null;
  campaign_id?: string | null;
  status?: MarketplaceTaskStatus;
}

export interface ReviewSubmissionInput {
  status: Extract<SubmissionStatus, "approved" | "revision_requested" | "rejected">;
  reviewer_notes?: string | null;
  ai_review?: string | null;
  /** 1-5 inclusive, validated server-side */
  rating?: number | null;
}

export interface SendTaskMessageInput {
  task_id: string;
  content: string;
  sender_type?: MessageSenderType;
}

// ─── Campaigns ──────────────────────────────────────────────

export interface Campaign {
  id: string;
  org_id: string;
  name: string;
  campaign_type: CampaignType;
  status: CampaignStatus | null;
  description: string | null;
  target_audience: string | null;
  channels: string[] | null;
  budget: number | null;
  start_date: string | null;
  end_date: string | null;
  goals: Json | null;
  metrics: Json | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface WeeklyReview {
  id: string;
  org_id: string;
  week_start: string;
  week_end: string;
  metrics: Json | null;
  wins: string[] | null;
  challenges: string[] | null;
  learnings: string[] | null;
  next_week_priorities: string[] | null;
  strategy_changes: string | null;
  ai_summary: string | null;
  generated_by: GeneratedBy | null;
  created_at: string | null;
}

export interface CreateCampaignInput {
  name: string;
  campaign_type: CampaignType;
  status?: CampaignStatus;
  description?: string | null;
  target_audience?: string | null;
  channels?: string[] | null;
  budget?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  goals?: Json | null;
}

export interface CreateWeeklyReviewInput {
  week_start: string;
  week_end: string;
  metrics?: Json | null;
  wins?: string[] | null;
  challenges?: string[] | null;
  learnings?: string[] | null;
  next_week_priorities?: string[] | null;
  strategy_changes?: string | null;
  ai_summary?: string | null;
  generated_by?: string | null;
}

// ─── Competitors ────────────────────────────────────────────

export interface Competitor {
  id: string;
  org_id: string;
  name: string;
  website: string | null;
  description: string | null;
  target_market: string | null;
  pricing: string | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  latest_moves: string | null;
  our_advantage: string | null;
  threat_level: string | null;
  last_analyzed: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateCompetitorInput {
  name: string;
  website?: string | null;
  description?: string | null;
  target_market?: string | null;
  pricing?: string | null;
  strengths?: string[] | null;
  weaknesses?: string[] | null;
  latest_moves?: string | null;
  our_advantage?: string | null;
  threat_level?: string | null;
}

export type UpdateCompetitorInput = Partial<CreateCompetitorInput>;

// ─── Insights ───────────────────────────────────────────────

export interface Insight {
  id: string;
  org_id: string;
  insight_type: string;
  title: string;
  description: string;
  source: string | null;
  evidence: string | null;
  action_taken: string | null;
  tags: string[] | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateInsightInput {
  insight_type: string;
  title: string;
  description: string;
  source?: string | null;
  evidence?: string | null;
  action_taken?: string | null;
  tags?: string[] | null;
}

// ─── Pipeline ───────────────────────────────────────────────

export interface PipelineSummary {
  org_id: string;
  lifecycle_stage: LifecycleStage | null;
  contact_type: ContactType | null;
  total: number;
  avg_lead_score: number | null;
}

// ─── Experiments & Results ──────────────────────────────────

export interface Experiment {
  id: string;
  org_id: string;
  strategy_doc_id: string | null;
  title: string;
  hypothesis: string | null;
  description: string | null;
  backlog_ref: string | null;
  strategy_section_ref: string | null;
  status: ExperimentStatus;
  started_at: string | null;
  completed_at: string | null;
  success_metric: string | null;
  success_target: number | null;
  baseline_value: number | null;
  planned_duration_days: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExperimentResult {
  id: string;
  org_id: string;
  experiment_id: string;
  recorded_at: string;
  week_start: string | null;
  metrics: Json;
  metric_value: number | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface CreateExperimentInput {
  title: string;
  hypothesis?: string | null;
  description?: string | null;
  strategy_doc_id?: string | null;
  backlog_ref?: string | null;
  strategy_section_ref?: string | null;
  success_metric?: string | null;
  success_target?: number | null;
  baseline_value?: number | null;
  planned_duration_days?: number | null;
}

export interface CreateExperimentResultInput {
  experiment_id: string;
  week_start?: string | null;
  metrics?: Json;
  metric_value?: number | null;
  notes?: string | null;
}

export interface ChannelPerformanceRow {
  strategy_section_ref: string;
  total_tasks: number;
  completed: number;
  failed: number;
  skipped: number;
  completion_rate: number;
}

// ─── Strategy Refinement (Phase 9B) ────────────────────────────

export interface RefinementRun {
  id: string;
  org_id: string;
  strategy_doc_id: string;
  approval_id: string | null;
  run_id: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  raw_suggestions: Json;
  suggestion_count: number;
  data_snapshot: Json;
  decisions: Json | null;
  applied_doc_id: string | null;
  skipped_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Documents ──────────────────────────────────────────────

export interface Document {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  tags: string[];
  uploaded_by: string | null;
  contact_id: string | null;
  campaign_id: string | null;
  strategy_doc_id: string | null;
  experiment_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDocumentInput {
  title: string;
  description?: string | null;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  tags?: string[];
  uploaded_by?: string;
  contact_id?: string | null;
  campaign_id?: string | null;
  strategy_doc_id?: string | null;
  experiment_id?: string | null;
}

export interface UpdateDocumentInput {
  title?: string;
  description?: string | null;
  tags?: string[];
  contact_id?: string | null;
  campaign_id?: string | null;
  strategy_doc_id?: string | null;
  experiment_id?: string | null;
}

// ─── Contact Imports ───────────────────────────────────────

export type ContactImportStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "partial"
  | "cancelled";

export interface ContactImport {
  id: string;
  org_id: string;
  file_name: string;
  status: ContactImportStatus;
  total_rows: number | null;
  max_rows: number;
  imported_rows: number;
  skipped_rows: number;
  error_rows: number;
  errors: ImportRowError[];
  column_mapping: Record<string, string> | null;
  storage_path: string | null;
  uploaded_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportRowError {
  row_number: number;
  field: string;
  reason: string;
}

export interface CreateImportInput {
  file_name: string;
  storage_path: string;
  column_mapping: Record<string, string>;
  total_rows: number;
  uploaded_by?: string;
}

export interface ImportProgressUpdate {
  status?: ContactImportStatus;
  imported_rows?: number;
  skipped_rows?: number;
  error_rows?: number;
  errors?: ImportRowError[];
  completed_at?: string;
}

// ─── Sync Infrastructure ───────────────────────────────────

export type SyncLogStatus = "running" | "completed" | "failed";
export type SyncType = "initial" | "incremental";
export type SyncDirection = "inbound" | "outbound" | "bidirectional";

export interface SyncLog {
  id: string;
  org_id: string;
  integration_type: string;
  sync_type: SyncType;
  direction: string;
  status: SyncLogStatus;
  records_processed: number;
  records_created: number;
  records_updated: number;
  records_failed: number;
  errors: Json;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface CreateSyncLogInput {
  integration_type: string;
  sync_type: SyncType;
  direction?: string;
}

export interface UpdateSyncLogInput {
  status?: SyncLogStatus;
  records_processed?: number;
  records_created?: number;
  records_updated?: number;
  records_failed?: number;
  errors?: unknown[];
  completed_at?: string;
}

// ─── HubSpot Field Mappings ────────────────────────────────

export type HubSpotFieldDirection = "hubspot_to_dtn" | "dtn_to_hubspot" | "bidirectional";

export interface HubSpotFieldMapping {
  id: string;
  org_id: string;
  hubspot_property: string;
  dtn_field: string;
  direction: HubSpotFieldDirection;
  transform_config: Json;
  created_at: string;
  updated_at: string;
}

export interface UpsertFieldMappingInput {
  hubspot_property: string;
  dtn_field: string;
  direction?: HubSpotFieldDirection;
  transform_config?: Json;
}

// ─── External Metrics ──────────────────────────────────────

export interface ExternalMetric {
  id: string;
  org_id: string;
  source: string;
  metric_type: string | null;
  metric_name: string;
  metric_value: number;
  dimensions: Record<string, string>;
  period_start: string;
  period_end: string;
  recorded_at: string;
  raw_data: Json | null;
  experiment_id: string | null;
  created_at: string;
}

export interface CreateExternalMetricInput {
  source: string;
  metric_type?: string;
  metric_name: string;
  metric_value: number;
  dimensions?: Record<string, string>;
  period_start: string;
  period_end: string;
  raw_data?: Json;
  experiment_id?: string;
}

export interface MetricTrendPoint {
  period_start: string;
  period_end: string;
  metric_value: number;
}

export interface MetricsSummary {
  source: string;
  metric_name: string;
  total_value: number;
  count: number;
  latest_period_start: string;
}

// ─── Webhook Subscriptions ─────────────────────────────────

export interface WebhookSubscription {
  id: string;
  org_id: string;
  event_type: string;
  target_url: string;
  vault_secret_id: string;
  is_active: boolean;
  last_triggered_at: string | null;
  last_failure_at: string | null;
  failure_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWebhookSubscriptionInput {
  event_type: string;
  target_url: string;
}

export type WebhookEventType =
  | "task.created"
  | "task.status_changed"
  | "experiment.completed"
  | "strategy.refined"
  | "contact.created"
  | "contact.updated";
