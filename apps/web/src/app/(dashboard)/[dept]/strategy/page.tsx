import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import { getStrategyDocs } from "@/lib/strategy/actions";
import { DocList } from "@/components/strategy/doc-list";
import { RealtimeListener } from "@/components/realtime-listener";

export default async function StrategyPage() {
  const { membership } = await getAuthenticatedMembership();
  const docs = await getStrategyDocs();

  return (
    <RealtimeListener table="mktg_strategy_docs" orgId={membership.orgId}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Strategy Documents</h1>
          <p className="text-muted-foreground">
            Your marketing strategy hub. Create and edit strategy documents.
          </p>
        </div>
        <DocList docs={docs} />
      </div>
    </RealtimeListener>
  );
}
