import type {
  TaskStatus,
  Priority,
  TaskType,
  ExecutorType,
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
  next_week_focus: string[] | null;
  strategy_adjustments: string | null;
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
  next_week_focus?: string[] | null;
  strategy_adjustments?: string | null;
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
