import { Suspense } from "react";
import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import { getDocuments } from "@/lib/documents/actions";
import { DocumentsPageClient } from "@/components/documents/documents-page-client";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { membership } = await getAuthenticatedMembership();
  const params = await searchParams;

  const result = await getDocuments({
    search: params.search,
    file_type: params.type,
    page: params.page ? parseInt(params.page, 10) : 1,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="text-muted-foreground">
          Upload, preview, and manage files linked to your contacts, campaigns, and strategies.
        </p>
      </div>
      <Suspense>
        <DocumentsPageClient
          documents={result.documents}
          total={result.total}
          page={result.page}
          totalPages={result.totalPages}
          orgId={membership.orgId}
        />
      </Suspense>
    </div>
  );
}
