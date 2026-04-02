"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedMembership } from "@/lib/auth-helpers";

export interface ApprovalItem {
  id: string;
  org_id: string;
  department_id: string | null;
  item_type:
    | "social_post"
    | "blog_post"
    | "email_draft"
    | "task_submission"
    | "strategy_change";
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  submitted_by_type: "freelancer" | "n8n" | "claude_api" | "member";
  submitted_by_id: string | null;
  assigned_reviewer: string | null;
  daily_task_id: string | null;
  status: "pending" | "approved" | "rejected" | "revision_requested";
  reviewer_notes: string | null;
  reviewed_at: string | null;
  publish_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined fields
  daily_task?: { title: string; task_type: string; description?: string; priority?: string; executor_type?: string } | null;
  reviewer_profile?: { display_name: string | null; email: string } | null;
}

export interface ApprovalFilters {
  status?: string;
  item_type?: string;
  submitted_by_type?: string;
  page?: number;
}

export interface ApprovalStats {
  pending: number;
  approved_7d: number;
  rejected_7d: number;
}

const PAGE_SIZE = 20;

async function getDepartmentId(
  orgId: string,
  deptSlug: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dtn_departments")
    .select("id")
    .eq("org_id", orgId)
    .eq("slug", deptSlug)
    .single();
  return data?.id ?? null;
}

export async function getApprovalItems(
  deptSlug: string,
  filters: ApprovalFilters = {}
) {
  const { membership } = await getAuthenticatedMembership();
  const supabase = await createClient();
  const departmentId = await getDepartmentId(membership.orgId, deptSlug);

  const page = filters.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("dtn_approval_queue")
    .select(
      "*, daily_task:dtn_daily_tasks!dtn_approval_queue_daily_task_id_fkey(title, task_type), reviewer_profile:profiles!dtn_approval_queue_assigned_reviewer_fkey(display_name, email)",
      { count: "exact" }
    )
    .eq("org_id", membership.orgId)
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (departmentId) {
    query = query.eq("department_id", departmentId);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.item_type) {
    query = query.eq("item_type", filters.item_type);
  }
  if (filters.submitted_by_type) {
    query = query.eq("submitted_by_type", filters.submitted_by_type);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    items: (data ?? []) as ApprovalItem[],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
  };
}

export async function getApprovalItem(itemId: string) {
  const { membership } = await getAuthenticatedMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dtn_approval_queue")
    .select(
      "*, daily_task:dtn_daily_tasks!dtn_approval_queue_daily_task_id_fkey(title, task_type, description, priority, executor_type), reviewer_profile:profiles!dtn_approval_queue_assigned_reviewer_fkey(display_name, email)"
    )
    .eq("id", itemId)
    .eq("org_id", membership.orgId)
    .single();

  if (error) throw new Error(error.message);
  return data as ApprovalItem;
}

export async function reviewApprovalItem(
  itemId: string,
  status: "approved" | "rejected" | "revision_requested",
  reviewerNotes?: string
) {
  const { membership, user } = await getAuthenticatedMembership([
    "owner",
    "admin",
  ]);

  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("review_approval_item", {
    p_approval_id: itemId,
    p_org_id: membership.orgId,
    p_reviewer_id: user.id,
    p_status: status,
    p_reviewer_notes: reviewerNotes || null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  return data;
}

export async function getApprovalStats(deptSlug: string) {
  const { membership } = await getAuthenticatedMembership();
  const supabase = await createClient();
  const departmentId = await getDepartmentId(membership.orgId, deptSlug);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString();

  let pendingQuery = supabase
    .from("dtn_approval_queue")
    .select("id", { count: "exact", head: true })
    .eq("org_id", membership.orgId)
    .eq("status", "pending");

  let approved7dQuery = supabase
    .from("dtn_approval_queue")
    .select("id", { count: "exact", head: true })
    .eq("org_id", membership.orgId)
    .eq("status", "approved")
    .gte("reviewed_at", sevenDaysAgoStr);

  let rejected7dQuery = supabase
    .from("dtn_approval_queue")
    .select("id", { count: "exact", head: true })
    .eq("org_id", membership.orgId)
    .eq("status", "rejected")
    .gte("reviewed_at", sevenDaysAgoStr);

  if (departmentId) {
    pendingQuery = pendingQuery.eq("department_id", departmentId);
    approved7dQuery = approved7dQuery.eq("department_id", departmentId);
    rejected7dQuery = rejected7dQuery.eq("department_id", departmentId);
  }

  const [pending, approved, rejected] = await Promise.all([
    pendingQuery,
    approved7dQuery,
    rejected7dQuery,
  ]);

  return {
    pending: pending.count ?? 0,
    approved_7d: approved.count ?? 0,
    rejected_7d: rejected.count ?? 0,
  } as ApprovalStats;
}
