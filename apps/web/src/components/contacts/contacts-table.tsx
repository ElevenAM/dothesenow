"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Contact } from "@/lib/contacts/actions";
import { STAGE_LABELS } from "@/lib/pipeline/types";
import { useRouter, useSearchParams } from "next/navigation";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-[var(--label-green-bg)] text-[var(--label-green-fg)]",
  inactive: "bg-[var(--label-default-bg)] text-[var(--label-default-fg)]",
  do_not_contact: "bg-[var(--label-red-bg)] text-[var(--label-red-fg)]",
  churned: "bg-[var(--label-yellow-bg)] text-[var(--label-yellow-fg)]",
};

interface ContactsTableProps {
  contacts: Contact[];
  total: number;
  page: number;
  totalPages: number;
  onSelectContact: (contact: Contact) => void;
}

export function ContactsTable({
  contacts,
  total,
  page,
  totalPages,
  onSelectContact,
}: ContactsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const goToPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`?${params.toString()}`);
  };

  if (contacts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg font-medium">No contacts found</p>
        <p className="text-sm mt-1">Try adjusting your filters or add a new contact.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((contact) => (
            <TableRow
              key={contact.id}
              className="cursor-pointer"
              onClick={() => onSelectContact(contact)}
            >
              <TableCell className="font-medium">
                {contact.first_name} {contact.last_name || ""}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {contact.email || "-"}
              </TableCell>
              <TableCell>{contact.company || "-"}</TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize text-xs">
                  {contact.contact_type}
                </Badge>
              </TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[contact.status] || ""}`}
                >
                  {contact.status.replace("_", " ")}
                </span>
              </TableCell>
              <TableCell className="text-sm">
                {STAGE_LABELS[contact.lifecycle_stage] || contact.lifecycle_stage}
              </TableCell>
              <TableCell className="tabular-nums">{contact.lead_score}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} contact{total !== 1 ? "s" : ""} total
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
