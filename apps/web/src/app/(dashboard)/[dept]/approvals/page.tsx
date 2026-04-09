import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { getRequestContext } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDepartmentId } from "@/lib/departments";
import {
  getApprovalsForOrg,
  getApprovalStats,
} from "@dothesenow/queries";
import { RealtimeListener } from "@/components/realtime-listener";
import { ApprovalsPageClient } from "@/components/approvals/approvals-page-client";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import type { ApprovalStatus, ApprovalItemType, SubmittedByType } from "@dothesenow/types";

const getCachedApprovalsData = unstable_cache(
  async (
    orgId: string,
    departmentId: string | null,
    status?: string,
    itemType?: string,
    submittedByType?: string,
    page?: number,
  ) => {
    const admin = createAdminClient();
    const ctx = { client: admin, orgId };
    const [result, stats] = await Promise.all([
      getApprovalsForOrg(ctx, {
        status: status as ApprovalStatus | undefined,
        item_type: itemType as ApprovalItemType | undefined,
        submitted_by_type: submittedByType as SubmittedByType | undefined,
        page: page ?? 1,
        department_id: departmentId ?? undefined,
      }),
      getApprovalStats(ctx, departmentId ?? undefined),
    ]);
    return { result, stats };
  },
  ["approvals"],
  { revalidate: 30, tags: ["approvals"] },
);

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

  const departmentId = await getDepartmentId(membership.orgId, dept);

  const { result, stats } = await getCachedApprovalsData(
    membership.orgId,
    departmentId,
    resolvedSearch.status,
    resolvedSearch.item_type,
    resolvedSearch.submitted_by_type,
    resolvedSearch.page ? parseInt(resolvedSearch.page, 10) : undefined,
  );

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
