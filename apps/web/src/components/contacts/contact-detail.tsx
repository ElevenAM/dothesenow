"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Save,
  Loader2,
  Plus,
  FileText,
} from "lucide-react";
import { OutreachTimeline } from "./outreach-timeline";
import { LogOutreachDialog } from "./log-outreach-dialog";
import type { Contact, OutreachEntry, Document } from "@dothesenow/types";
import { updateContact } from "@/lib/contacts/actions";

const CONTACT_TYPES = ["lead", "prospect", "customer", "partner", "influencer", "therapist", "media", "other"] as const;
const CONTACT_STATUSES = ["active", "inactive", "do_not_contact", "churned"] as const;
const LIFECYCLE_STAGES = ["awareness", "consideration", "decision", "customer", "advocate"] as const;

interface ContactDetailProps {
  contact: Contact;
  outreach: OutreachEntry[];
  documents: Document[];
  dept: string;
}

export function ContactDetail({
  contact,
  outreach,
  documents,
  dept,
}: ContactDetailProps) {
  const [form, setForm] = useState({
    first_name: contact.first_name,
    last_name: contact.last_name ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    company: contact.company ?? "",
    title: contact.title ?? "",
    contact_type: contact.contact_type,
    status: contact.status,
    lifecycle_stage: contact.lifecycle_stage,
    location: contact.location ?? "",
    source: contact.source ?? "",
    persona: contact.persona ?? "",
    lead_score: contact.lead_score,
    notes: contact.notes ?? "",
  });

  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(field: string, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateContact(contact.id, {
          ...form,
          last_name: form.last_name || null,
          email: form.email || null,
          phone: form.phone || null,
          company: form.company || null,
          title: form.title || null,
          location: form.location || null,
          source: form.source || null,
          persona: form.persona || null,
          notes: form.notes || null,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/${dept}/contacts`}>
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">
            {contact.first_name} {contact.last_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {contact.company && `${contact.company} · `}
            {contact.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-[var(--fgColor-success)]">Saved</span>}
          <Button onClick={handleSave} disabled={isPending} size="sm">
            {isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: editable fields */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="First Name" value={form.first_name} onChange={(v) => update("first_name", v)} required />
              <Field label="Last Name" value={form.last_name} onChange={(v) => update("last_name", v)} />
              <Field label="Email" value={form.email} onChange={(v) => update("email", v)} type="email" />
              <Field label="Phone" value={form.phone} onChange={(v) => update("phone", v)} type="tel" />
              <Field label="Company" value={form.company} onChange={(v) => update("company", v)} />
              <Field label="Job Title" value={form.title} onChange={(v) => update("title", v)} />
              <Field label="Location" value={form.location} onChange={(v) => update("location", v)} />
              <Field label="Source" value={form.source} onChange={(v) => update("source", v)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Classification</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <SelectField
                label="Type"
                value={form.contact_type}
                options={CONTACT_TYPES}
                onChange={(v) => update("contact_type", v)}
              />
              <SelectField
                label="Status"
                value={form.status}
                options={CONTACT_STATUSES}
                onChange={(v) => update("status", v)}
              />
              <SelectField
                label="Lifecycle Stage"
                value={form.lifecycle_stage}
                options={LIFECYCLE_STAGES}
                onChange={(v) => update("lifecycle_stage", v)}
              />
              <Field label="Persona" value={form.persona} onChange={(v) => update("persona", v)} />
              <div className="space-y-2">
                <Label>Lead Score</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.lead_score}
                  onChange={(e) => update("lead_score", parseInt(e.target.value, 10) || 0)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                rows={4}
                placeholder="Add notes about this contact..."
              />
            </CardContent>
          </Card>
        </div>

        {/* Right column: outreach + documents */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Outreach</CardTitle>
              <LogOutreachDialog contactId={contact.id} />
            </CardHeader>
            <CardContent>
              <OutreachTimeline entries={outreach} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No documents linked to this contact.
                </p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-2 rounded-md border border-[var(--borderColor-default)] p-2 text-sm"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1">{doc.title}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {doc.file_type.split("/").pop()}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <p>Created: {new Date(contact.created_at).toLocaleDateString()}</p>
              <p>Updated: {new Date(contact.updated_at).toLocaleDateString()}</p>
              {contact.last_engaged && (
                <p>Last engaged: {new Date(contact.last_engaged).toLocaleDateString()}</p>
              )}
              {contact.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {contact.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt.replace(/_/g, " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
