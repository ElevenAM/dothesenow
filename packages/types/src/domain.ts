import type {
  TaskStatus,
  Priority,
  TaskType,
  ExecutorType,
  GeneratedBy,
  ContactType,
  ContactStatus,
  LifecycleStage,
  OutreachChannel,
  OutreachDirection,
  OutreachStatus,
  DocType,
  ApprovalItemType,
  ApprovalStatus,
  SubmittedByType,
  MemberRole,
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
  generated_by: GeneratedBy | null;
  generation_context: Json | null;
  created_at: string | null;
  updated_at: string | null;
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
  lifecycle_stage: LifecycleStage | null;
  tags: string[] | null;
  location: string | null;
  source: string | null;
  persona: string | null;
  lead_score: number | null;
  last_engaged: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
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
  created_at: string | null;
}

// ─── Strategy Docs ───────────────────────────────────────────

export interface StrategyDoc {
  id: string;
  org_id: string;
  doc_type: DocType;
  title: string;
  content: string;
  version: number | null;
  tags: string[] | null;
  previous_version_id: string | null;
  change_summary: string | null;
  changed_by: string | null;
  is_active: boolean | null;
  embedding: string | null;
  created_at: string | null;
  updated_at: string | null;
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
  created_at: string | null;
  updated_at: string | null;
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
  created_at: string | null;
  updated_at: string | null;
}

// ─── Memberships ─────────────────────────────────────────────

export interface Membership {
  id: string;
  org_id: string;
  user_id: string | null;
  role: MemberRole;
  is_active: boolean | null;
  invited_email: string | null;
  invited_by: string | null;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string | null;
}

// ─── Departments ─────────────────────────────────────────────

export interface Department {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  icon: string | null;
  is_active: boolean | null;
  created_at: string | null;
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

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  task_type?: TaskType;
  priority?: Priority;
  executor_type?: ExecutorType;
  executor_config?: Json | null;
  status?: TaskStatus;
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
