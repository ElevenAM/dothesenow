"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { OutreachTimeline } from "./outreach-timeline";
import { getOutreachHistory } from "@/lib/contacts/actions";
import type { Contact, OutreachEntry } from "@/lib/contacts/actions";
import { Loader2, Mail, Phone, Building, MapPin, Tag } from "lucide-react";

interface ContactSheetProps {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactSheet({ contact, open, onOpenChange }: ContactSheetProps) {
  const [outreach, setOutreach] = useState<OutreachEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [outreachError, setOutreachError] = useState<string | null>(null);

  useEffect(() => {
    if (contact && open) {
      setIsLoading(true);
      setOutreachError(null);
      getOutreachHistory(contact.id)
        .then((data) => {
          setOutreach(data);
        })
        .catch(() => {
          setOutreachError("Failed to load outreach history");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [contact?.id, open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!contact) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {contact.first_name} {contact.last_name || ""}
          </SheetTitle>
          <SheetDescription>
            <span className="capitalize">{contact.contact_type}</span>
            {contact.company && ` at ${contact.company}`}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Contact info */}
          <div className="space-y-2 text-sm">
            {contact.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span>{contact.email}</span>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                <span>{contact.phone}</span>
              </div>
            )}
            {contact.title && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building className="h-3.5 w-3.5" />
                <span>{contact.title}</span>
              </div>
            )}
            {contact.location && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                <span>{contact.location}</span>
              </div>
            )}
          </div>

          {/* Tags and metadata */}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="capitalize">
              {contact.status}
            </Badge>
            <Badge variant="secondary" className="capitalize">
              {contact.lifecycle_stage}
            </Badge>
            {contact.source && (
              <Badge variant="outline">
                <Tag className="h-3 w-3 mr-1" />
                {contact.source}
              </Badge>
            )}
            {contact.tags?.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>

          {/* Lead score */}
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Lead Score: </span>
              <span className="font-medium">{contact.lead_score}</span>
            </div>
            {contact.last_engaged && (
              <div>
                <span className="text-muted-foreground">Last Engaged: </span>
                <span className="font-medium">
                  {new Date(contact.last_engaged).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>

          {/* Notes */}
          {contact.notes && (
            <div className="text-sm">
              <p className="text-muted-foreground text-xs mb-1">Notes</p>
              <p className="whitespace-pre-wrap">{contact.notes}</p>
            </div>
          )}

          <Separator />

          {/* Outreach history */}
          <div>
            <h3 className="text-sm font-medium mb-3">
              Outreach History
              {!isLoading && outreach.length > 0 && (
                <span className="text-muted-foreground font-normal ml-1">
                  ({outreach.length})
                </span>
              )}
            </h3>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading outreach history...
              </div>
            ) : outreachError ? (
              <div className="text-sm text-destructive py-4">{outreachError}</div>
            ) : (
              <OutreachTimeline entries={outreach} />
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
