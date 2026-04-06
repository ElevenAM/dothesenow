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
