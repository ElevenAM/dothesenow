"use client";

import { Suspense, useState } from "react";
import { ContactsTable } from "./contacts-table";
import { ContactsFilters } from "./contacts-filters";
import { ContactSheet } from "./contact-sheet";
import { AddContactDialog } from "./contact-form";
import { ContactImportDialog } from "./contact-import-dialog";
import { ImportProgressBanner } from "./import-progress-banner";
import { Skeleton } from "@/components/ui/skeleton";
import type { Contact } from "@/lib/contacts/actions";

interface ContactsPageClientProps {
  contacts: Contact[];
  total: number;
  page: number;
  totalPages: number;
  activeImportIds?: string[];
}

export function ContactsPageClient({
  contacts,
  total,
  page,
  totalPages,
  activeImportIds = [],
}: ContactsPageClientProps) {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dismissedImports, setDismissedImports] = useState<Set<string>>(new Set());

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setSheetOpen(true);
  };

  const visibleImports = activeImportIds.filter((id) => !dismissedImports.has(id));

  return (
    <div className="space-y-4">
      {/* Active import banners */}
      {visibleImports.map((importId) => (
        <ImportProgressBanner
          key={importId}
          importId={importId}
          onDismiss={() => setDismissedImports((prev) => new Set(prev).add(importId))}
        />
      ))}

      <div className="flex items-center justify-between gap-4">
        <Suspense fallback={<div className="flex gap-2"><Skeleton className="h-8 w-32" /><Skeleton className="h-8 w-32" /></div>}>
          <ContactsFilters />
        </Suspense>
        <div className="flex items-center gap-2">
          <ContactImportDialog />
          <AddContactDialog />
        </div>
      </div>

      <Suspense fallback={<div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}>
        <ContactsTable
          contacts={contacts}
          total={total}
          page={page}
          totalPages={totalPages}
          onSelectContact={handleSelectContact}
        />
      </Suspense>

      <ContactSheet
        contact={selectedContact}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
