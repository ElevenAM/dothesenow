import { unstable_cache } from "next/cache";
import { getRequestContext } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStrategyDocs, getCreditBalance, getDocumentsForOrg } from "@dothesenow/queries";
import { STRATEGY_GENERATION_COST } from "@dothesenow/prompts";
import { DocList } from "@/components/strategy/doc-list";
import { StrategyGeneratorDialog } from "@/components/strategy/strategy-generator-dialog";
import { RealtimeListener } from "@/components/realtime-listener";

const getCachedStrategyData = unstable_cache(
  async (orgId: string) => {
    const admin = createAdminClient();
    const ctx = { client: admin, orgId };
    const [docs, { documents: uploadedDocs }] = await Promise.all([
      getStrategyDocs(ctx),
      getDocumentsForOrg(ctx),
    ]);
    return { docs, uploadedDocs };
  },
  ["strategy"],
  { revalidate: 60, tags: ["strategy"] },
);

const getCachedCreditBalance = unstable_cache(
  async (orgId: string) => {
    const admin = createAdminClient();
    const balance = await getCreditBalance({ client: admin, orgId });
    return balance.remaining;
  },
  ["credits"],
  { revalidate: 30, tags: ["credits"] },
);

export default async function StrategyPage() {
  const { membership, org } = await getRequestContext();

  const [{ docs, uploadedDocs }, remaining] = await Promise.all([
    getCachedStrategyData(membership.orgId),
    getCachedCreditBalance(membership.orgId),
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
            creditCost={STRATEGY_GENERATION_COST}
            orgProductDescription={org.productDescription}
            orgValueProposition={org.valueProposition}
            orgWebsiteUrl={org.websiteUrl}
            orgTargetCustomer={org.targetCustomer}
            availableDocuments={uploadedDocs.map((d) => ({
              id: d.id,
              title: d.title,
              file_name: d.file_name,
              file_type: d.file_type,
              file_size: d.file_size,
            }))}
          />
        </div>
        <DocList docs={docs} />
      </div>
    </RealtimeListener>
  );
}
