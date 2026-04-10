"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentCard } from "./document-card";
import { DocumentUploadDialog } from "./document-upload-dialog";
import { DocumentDetailSheet } from "./document-detail-sheet";
import { FileText, Search, ChevronLeft, ChevronRight } from "lucide-react";
import type { Document } from "@/lib/documents/actions";

interface DocumentsPageClientProps {
  documents: Document[];
  total: number;
  page: number;
  totalPages: number;
  orgId: string;
}

export function DocumentsPageClient({
  documents,
  total,
  page,
  totalPages,
}: DocumentsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentSearch = searchParams.get("search") ?? "";

  function updateSearch(value: string) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("search", value);
      } else {
        params.delete("search");
      }
      params.delete("page");
      router.push(`?${params.toString()}`);
    });
  }

  function goToPage(p: number) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", String(p));
      router.push(`?${params.toString()}`);
    });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search context docs..."
            defaultValue={currentSearch}
            onChange={(e) => updateSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <DocumentUploadDialog />
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No context docs yet"
          description="Upload your first context document to inform AI outputs."
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {total} document{total !== 1 ? "s" : ""}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                onClick={() => setSelectedDoc(doc)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isPending}
                onClick={() => goToPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isPending}
                onClick={() => goToPage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {selectedDoc && (
        <DocumentDetailSheet
          document={selectedDoc}
          open={!!selectedDoc}
          onOpenChange={(open) => !open && setSelectedDoc(null)}
        />
      )}
    </>
  );
}
