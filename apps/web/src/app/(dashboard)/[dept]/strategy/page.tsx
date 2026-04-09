import { getRequestContext } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getStrategyDocs, getCreditBalance } from "@dothesenow/queries";
import { DocList } from "@/components/strategy/doc-list";
import { StrategyGeneratorDialog } from "@/components/strategy/strategy-generator-dialog";
import { RealtimeListener } from "@/components/realtime-listener";

export default async function StrategyPage() {
  const { membership, org } = await getRequestContext();
  const supabase = await createClient();
  const ctx = { client: supabase, orgId: membership.orgId };
  const [docs, { remaining }] = await Promise.all([
    getStrategyDocs(ctx),
    getCreditBalance(ctx),
  ]);

  const existingTypes = docs.map((d) => d.doc_type);

  return (
    <RealtimeListener table="mktg_strategy_docs" orgId={membership.orgId}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Strategy Documents</h1>
            <p className="text-muted-foreground">
              Your marketing strategy hub. Create and edit strategy documents.
            </p>
          </div>
          <StrategyGeneratorDialog
            orgIndustry={org.industry}
            orgBudgetTier={org.budgetTier}
            existingTypes={existingTypes}
            creditBalance={remaining}
          />
        </div>
        <DocList docs={docs} />
      </div>
    </RealtimeListener>
  );
}
