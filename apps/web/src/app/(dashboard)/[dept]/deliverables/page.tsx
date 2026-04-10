import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestContext } from "@/lib/auth-helpers";
import { getBlogPostsForOrg } from "@dothesenow/queries";
import { DeliverablesPageClient } from "@/components/deliverables/deliverables-page-client";

const getCachedDeliverables = unstable_cache(
  async (orgId: string) => {
    const admin = createAdminClient();
    const ctx = { client: admin, orgId };
    return getBlogPostsForOrg(ctx);
  },
  ["blog"],
  { revalidate: 60, tags: ["blog"] },
);

export default async function DeliverablesPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const { membership } = await getRequestContext();
  const deliverables = await getCachedDeliverables(membership.orgId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Deliverables</h1>
        <p className="mt-1 text-sm text-[var(--fgColor-muted)]">
          Review and manage outputs from completed tasks.
        </p>
      </div>

      <DeliverablesPageClient deliverables={deliverables} dept={dept} />
    </div>
  );
}
