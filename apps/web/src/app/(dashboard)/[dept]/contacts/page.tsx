import { getRequestContext } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getContactsForOrg, getImportsForOrg } from "@dothesenow/queries";
import { ContactsPageClient } from "@/components/contacts/contacts-page-client";
import { RealtimeListener } from "@/components/realtime-listener";
import type { ContactImport, ContactFilters } from "@dothesenow/types";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { membership } = await getRequestContext();
  const supabase = await createClient();
  const ctx = { client: supabase, orgId: membership.orgId };
  const params = await searchParams;

  const [result, imports] = await Promise.all([
    getContactsForOrg(ctx, {
      search: params.search,
      contact_type: params.type as ContactFilters["contact_type"],
      status: params.status as ContactFilters["status"],
      lifecycle_stage: params.stage as ContactFilters["lifecycle_stage"],
      page: params.page ? parseInt(params.page, 10) : 1,
    }),
    getImportsForOrg(ctx).catch((err: unknown) => {
      console.error("getImportsForOrg failed:", err);
      return [] as ContactImport[];
    }),
  ]);

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
