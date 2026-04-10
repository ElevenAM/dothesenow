"use server";

import { revalidateTag } from "next/cache";
import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import { getDepartmentId } from "@/lib/departments";
import {
  getApprovalsForOrg,
  getApprovalById,
  getApprovalStats as sharedGetApprovalStats,
  reviewApproval,
  createBlogPost,
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
  }, "web_ui");

  // When a blog_post approval is approved, create a deliverable from its content
  if (status === "approved") {
    const item = await getApprovalById(ctx, itemId);
    if (item && item.item_type === "blog_post") {
      const slug = item.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      await createBlogPost(ctx, {
        title: item.title,
        slug,
        content: item.content,
        status: "approved",
        department_id: item.department_id,
        user_id: auth.user.id,
        task_id: item.daily_task_id,
      });

      revalidateTag("blog", "max");
    }
  }

  revalidateTag("approvals", "max");
  return result;
}

export async function getApprovalStats(deptSlug: string): Promise<ApprovalStats> {
  const { ctx } = await getAuthenticatedOrgContext();
  const departmentId = await getDepartmentId(ctx.orgId, deptSlug);
  return sharedGetApprovalStats(ctx, departmentId ?? undefined);
}
