import type { OrgContext } from "./context.js";
import type {
  ApprovalItem,
  ApprovalItemWithTask,
  ApprovalStats,
  CreateApprovalInput,
  ReviewApprovalInput,
  ApprovalFilters,
} from "@dothesenow/types";
import { QueryError } from "./errors.js";

const TABLE = "dtn_approval_queue";
const DEFAULT_PAGE_SIZE = 20;

const WITH_TASK_SELECT =
  "*, daily_task:dtn_daily_tasks!dtn_approval_queue_daily_task_id_fkey(title, task_type, description, priority, executor_type), reviewer_profile:profiles!dtn_approval_queue_assigned_reviewer_fkey(display_name, email)";

export interface PaginatedApprovals {
  items: ApprovalItemWithTask[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getApprovalsForOrg(
  ctx: OrgContext,
  filters?: ApprovalFilters & { department_id?: string; pageSize?: number },
): Promise<PaginatedApprovals> {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  let query = ctx.client
    .from(TABLE)
    .select(WITH_TASK_SELECT, { count: "exact" })
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (filters?.department_id) {
    query = query.eq("department_id", filters.department_id);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.item_type) {
    query = query.eq("item_type", filters.item_type);
  }
  if (filters?.submitted_by_type) {
    query = query.eq("submitted_by_type", filters.submitted_by_type);
  }

  const { data, error, count } = await query;

  if (error) throw new QueryError(error.message, TABLE, "getApprovalsForOrg", ctx.orgId, error);

  return {
    items: (data ?? []) as ApprovalItemWithTask[],
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  };
}

export async function getApprovalById(
  ctx: OrgContext,
  itemId: string,
): Promise<ApprovalItemWithTask | null> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select(WITH_TASK_SELECT)
    .eq("id", itemId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (error) throw new QueryError(error.message, TABLE, "getApprovalById", ctx.orgId, error);
  return data as ApprovalItemWithTask | null;
}

export async function getApprovalStats(
  ctx: OrgContext,
  departmentId?: string,
): Promise<ApprovalStats> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const since = sevenDaysAgo.toISOString();

  // Pending count
  let pendingQuery = ctx.client
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .eq("status", "pending");
  if (departmentId) pendingQuery = pendingQuery.eq("department_id", departmentId);
  const { count: pending, error: e1 } = await pendingQuery;

  if (e1) throw new QueryError(e1.message, TABLE, "getApprovalStats", ctx.orgId, e1);

  // Approved last 7 days
  let approvedQuery = ctx.client
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .eq("status", "approved")
    .gte("reviewed_at", since);
  if (departmentId) approvedQuery = approvedQuery.eq("department_id", departmentId);
  const { count: approved_7d, error: e2 } = await approvedQuery;

  if (e2) throw new QueryError(e2.message, TABLE, "getApprovalStats", ctx.orgId, e2);

  // Rejected last 7 days
  let rejectedQuery = ctx.client
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .eq("status", "rejected")
    .gte("reviewed_at", since);
  if (departmentId) rejectedQuery = rejectedQuery.eq("department_id", departmentId);
  const { count: rejected_7d, error: e3 } = await rejectedQuery;

  if (e3) throw new QueryError(e3.message, TABLE, "getApprovalStats", ctx.orgId, e3);

  return {
    pending: pending ?? 0,
    approved_7d: approved_7d ?? 0,
    rejected_7d: rejected_7d ?? 0,
  };
}

export async function createApproval(
  ctx: OrgContext,
  input: CreateApprovalInput,
): Promise<ApprovalItem> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .insert({
      ...input,
      org_id: ctx.orgId,
    })
    .select()
    .single();

  if (error) throw new QueryError(error.message, TABLE, "createApproval", ctx.orgId, error);
  return data as ApprovalItem;
}

export async function reviewApproval(
  ctx: OrgContext,
  itemId: string,
  reviewerId: string | null,
  input: ReviewApprovalInput,
): Promise<unknown> {
  const { data, error } = await ctx.client.rpc("review_approval_item", {
    p_approval_id: itemId,
    p_org_id: ctx.orgId,
    p_reviewer_id: reviewerId,
    p_status: input.status,
    p_reviewer_notes: input.reviewer_notes ?? null,
  });

  if (error) throw new QueryError(error.message, TABLE, "reviewApproval", ctx.orgId, error);
  return data;
}
