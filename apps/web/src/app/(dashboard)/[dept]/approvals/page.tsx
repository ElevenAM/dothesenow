import { Suspense } from "react";
import { getRequestContext } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getDepartmentId } from "@/lib/departments";
import {
  getApprovalsForOrg,
  getApprovalStats,
} from "@dothesenow/queries";
import { RealtimeListener } from "@/components/realtime-listener";
import { ApprovalsPageClient } from "@/components/approvals/approvals-page-client";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import type { ApprovalStatus, ApprovalItemType, SubmittedByType } from "@dothesenow/types";

export default async function ApprovalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ dept: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { dept } = await params;
  const resolvedSearch = await searchParams;

  const { membership } = await getRequestContext();
  const canReview =
    membership.role === "owner" || membership.role === "admin";

  const supabase = await createClient();
  const ctx = { client: supabase, orgId: membership.orgId };
  const departmentId = await getDepartmentId(membership.orgId, dept);

  const [result, stats] = await Promise.all([
    getApprovalsForOrg(ctx, {
      status: resolvedSearch.status as ApprovalStatus | undefined,
      item_type: resolvedSearch.item_type as ApprovalItemType | undefined,
      submitted_by_type: resolvedSearch.submitted_by_type as SubmittedByType | undefined,
      page: resolvedSearch.page ? parseInt(resolvedSearch.page, 10) : 1,
      department_id: departmentId ?? undefined,
    }),
    getApprovalStats(ctx, departmentId ?? undefined),
  ]);

  return (
    <RealtimeListener table="dtn_approval_queue" orgId={membership.orgId}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Approvals</h1>
          <p className="text-muted-foreground">
            Review content from automated executors and team members.
          </p>
        </div>
        <Suspense fallback={<PageSkeleton variant="table" />}>
          <ApprovalsPageClient
            items={result.items}
            stats={stats}
            total={result.total}
            page={result.page}
            totalPages={result.totalPages}
            dept={dept}
            canReview={canReview}
          />
        </Suspense>
      </div>
    </RealtimeListener>
  );
}
