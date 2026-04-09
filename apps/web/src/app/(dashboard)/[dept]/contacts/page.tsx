import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import { searchContacts, getContactImports } from "@/lib/contacts/actions";
import { ContactsPageClient } from "@/components/contacts/contacts-page-client";
import { RealtimeListener } from "@/components/realtime-listener";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { membership } = await getAuthenticatedMembership();
  const params = await searchParams;

  const [result, imports] = await Promise.all([
    searchContacts({
      search: params.search,
      contact_type: params.type,
      status: params.status,
      lifecycle_stage: params.stage,
      page: params.page ? parseInt(params.page, 10) : 1,
    }),
    getContactImports(),
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
