import { unstable_cache } from "next/cache";
import { getRequestContext } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContactsForOrg, getImportsForOrg } from "@dothesenow/queries";
import { ContactsPageClient } from "@/components/contacts/contacts-page-client";
import { RealtimeListener } from "@/components/realtime-listener";
import type { ContactImport, ContactFilters } from "@dothesenow/types";

const getCachedContactsData = unstable_cache(
  async (
    orgId: string,
    search: string | null,
    contactType: string | null,
    status: string | null,
    lifecycleStage: string | null,
    page: number,
  ) => {
    const admin = createAdminClient();
    const ctx = { client: admin, orgId };
    const [result, imports] = await Promise.all([
      getContactsForOrg(ctx, {
        search: search ?? undefined,
        contact_type: (contactType ?? undefined) as ContactFilters["contact_type"],
        status: (status ?? undefined) as ContactFilters["status"],
        lifecycle_stage: (lifecycleStage ?? undefined) as ContactFilters["lifecycle_stage"],
        page,
      }),
      getImportsForOrg(ctx).catch((err: unknown) => {
        console.error("getImportsForOrg failed:", err);
        return [] as ContactImport[];
      }),
    ]);
    return { result, imports };
  },
  ["contacts"],
  { revalidate: 30, tags: ["contacts"] },
);

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { membership } = await getRequestContext();
  const params = await searchParams;

  const { result, imports } = await getCachedContactsData(
    membership.orgId,
    params.search ?? null,
    params.type ?? null,
    params.status ?? null,
    params.stage ?? null,
    params.page ? parseInt(params.page, 10) : 1,
  );

  // Show banners for imports that are still active or recently completed (last 5 min)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const activeImportIds = imports
    .filter(
      (imp) =>
        imp.status === "pending" ||
        imp.status === "processing" ||
        (imp.completed_at && imp.completed_at > fiveMinAgo),
    )
    .map((imp) => imp.id);

  return (
    <RealtimeListener table="mktg_contacts" orgId={membership.orgId}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-muted-foreground">
            Manage your CRM contacts and track outreach.
          </p>
        </div>
        <ContactsPageClient
          contacts={result.contacts}
          total={result.total}
          page={result.page}
          totalPages={result.totalPages}
          activeImportIds={activeImportIds}
        />
      </div>
    </RealtimeListener>
  );
}
