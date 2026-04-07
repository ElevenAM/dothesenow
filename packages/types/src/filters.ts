import type {
  TaskStatus,
  Priority,
  ExecutorType,
  ContactType,
  ContactStatus,
  LifecycleStage,
  ApprovalStatus,
  ApprovalItemType,
  SubmittedByType,
  DocType,
  MarketplaceTaskStatus,
  EngagementType,
  OutreachChannel,
  OutreachStatus,
} from "./enums.js";

export interface TaskFilters {
  status?: TaskStatus;
  priority?: Priority;
  executor_type?: ExecutorType;
  assigned_to?: string;
  department_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export interface ContactFilters {
  search?: string;
  contact_type?: ContactType;
  status?: ContactStatus;
  lifecycle_stage?: LifecycleStage;
  tags?: string[];
  owner_id?: string;
  source?: string;
  not_contacted_since_days?: number;
}

export interface ApprovalFilters {
  status?: ApprovalStatus;
  item_type?: ApprovalItemType;
  submitted_by_type?: SubmittedByType;
  page?: number;
}

export interface StrategyFilters {
  doc_type?: DocType;
  is_active?: boolean;
}

export interface MarketplaceTaskFilters {
  status?: MarketplaceTaskStatus;
  task_type?: string;
  assigned_to?: string;
  campaign_id?: string;
  limit?: number;
}

export interface FreelancerFilters {
  skills?: string[];
  engagement_type?: EngagementType | "both";
  min_rating?: number;
  available?: boolean;
}

export interface OutreachFilters {
  contact_id?: string;
  channel?: OutreachChannel;
  status?: OutreachStatus;
  since_days?: number;
  limit?: number;
}
