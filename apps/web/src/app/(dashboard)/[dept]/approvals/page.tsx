import { Suspense } from "react";
import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import { getApprovalItems, getApprovalStats } from "@/lib/approvals/actions";
import { RealtimeListener } from "@/components/realtime-listener";
import { ApprovalsPageClient } from "@/components/approvals/approvals-page-client";

export default async function ApprovalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ dept: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { dept } = await params;
  const resolvedSearch = await searchParams;

  const { membership } = await getAuthenticatedMembership();
  const canReview =
    membership.role === "owner" || membership.role === "admin";

  const [result, stats] = await Promise.all([
    getApprovalItems(dept, {
      status: resolvedSearch.status,
      item_type: resolvedSearch.item_type,
      submitted_by_type: resolvedSearch.submitted_by_type,
      page: resolvedSearch.page ? parseInt(resolvedSearch.page, 10) : 1,
    }),
    getApprovalStats(dept),
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
        <Suspense>
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
