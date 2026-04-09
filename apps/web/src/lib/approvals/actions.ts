"use server";

import { revalidateTag } from "next/cache";
import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import { getDepartmentId } from "@/lib/departments";
import {
  getApprovalsForOrg,
  getApprovalById,
  getApprovalStats as sharedGetApprovalStats,
  reviewApproval,
  type PaginatedApprovals,
} from "@dothesenow/queries";
import type {
  ApprovalItemWithTask,
  ApprovalStats,
  ApprovalFilters,
} from "@dothesenow/types";

export type { ApprovalItemWithTask as ApprovalItem, ApprovalStats } from "@dothesenow/types";
export type { PaginatedApprovals } from "@dothesenow/queries";

/** Accepts string-typed filter values from search params and forwards to shared queries. */
export async function getApprovalItems(
  deptSlug: string,
  filters: {
    status?: string;
    item_type?: string;
    submitted_by_type?: string;
    page?: number;
  } = {},
): Promise<PaginatedApprovals> {
  const { ctx } = await getAuthenticatedOrgContext();
  const departmentId = await getDepartmentId(ctx.orgId, deptSlug);

  return getApprovalsForOrg(ctx, {
    ...(filters as ApprovalFilters),
    department_id: departmentId ?? undefined,
  });
}

export async function getApprovalItem(itemId: string): Promise<ApprovalItemWithTask> {
  const { ctx } = await getAuthenticatedOrgContext();
  const item = await getApprovalById(ctx, itemId);
  if (!item) throw new Error("Approval item not found");
  return item;
}

export async function reviewApprovalItem(
  itemId: string,
  status: "approved" | "rejected" | "revision_requested",
  reviewerNotes?: string,
): Promise<unknown> {
  const { auth, ctx } = await getAuthenticatedOrgContext(["owner", "admin"]);

  const result = await reviewApproval(ctx, itemId, auth.user.id, {
    status,
    reviewer_notes: reviewerNotes || null,
  });

  revalidateTag("approvals", "max");
  return result;
}

export async function getApprovalStats(deptSlug: string): Promise<ApprovalStats> {
  const { ctx } = await getAuthenticatedOrgContext();
  const departmentId = await getDepartmentId(ctx.orgId, deptSlug);
  return sharedGetApprovalStats(ctx, departmentId ?? undefined);
}
