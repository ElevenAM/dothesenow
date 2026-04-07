"use client";

import { Suspense, useState } from "react";
import { ContactsTable } from "./contacts-table";
import { ContactsFilters } from "./contacts-filters";
import { ContactSheet } from "./contact-sheet";
import { AddContactDialog } from "./contact-form";
import { Skeleton } from "@/components/ui/skeleton";
import type { Contact } from "@/lib/contacts/actions";

interface ContactsPageClientProps {
  contacts: Contact[];
  total: number;
  page: number;
  totalPages: number;
}

export function ContactsPageClient({
  contacts,
  total,
  page,
  totalPages,
}: ContactsPageClientProps) {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Suspense fallback={<div className="flex gap-2"><Skeleton className="h-8 w-32" /><Skeleton className="h-8 w-32" /></div>}>
          <ContactsFilters />
        </Suspense>
        <AddContactDialog />
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
