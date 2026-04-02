"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedMembership } from "@/lib/auth-helpers";

export interface Contact {
  id: string;
  org_id: string;
  owner_id: string | null;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  contact_type: string;
  status: string;
  lifecycle_stage: string;
  tags: string[];
  location: string | null;
  source: string | null;
  persona: string | null;
  lead_score: number;
  last_engaged: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutreachEntry {
  id: string;
  contact_id: string;
  channel: string;
  direction: string;
  subject: string | null;
  content: string | null;
  status: string;
  persona_used: string | null;
  sent_at: string | null;
  response_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface ContactsFilters {
  search?: string;
  contact_type?: string;
  status?: string;
  lifecycle_stage?: string;
  page?: number;
}

const PAGE_SIZE = 20;

export async function searchContacts(filters: ContactsFilters = {}) {
  const { membership } = await getAuthenticatedMembership();
  const supabase = await createClient();

  const page = filters.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("mktg_contacts")
    .select("*", { count: "exact" })
    .eq("org_id", membership.orgId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(
      `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},company.ilike.${term}`,
    );
  }
  if (filters.contact_type) {
    query = query.eq("contact_type", filters.contact_type);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.lifecycle_stage) {
    query = query.eq("lifecycle_stage", filters.lifecycle_stage);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  return {
    contacts: (data ?? []) as Contact[],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
  };
}

export async function getContact(contactId: string) {
  const { membership } = await getAuthenticatedMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("mktg_contacts")
    .select("*")
    .eq("id", contactId)
    .eq("org_id", membership.orgId)
    .single();

  if (error) throw new Error(error.message);
  return data as Contact;
}

export async function getOutreachHistory(contactId: string) {
  const { membership } = await getAuthenticatedMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("mktg_outreach_log")
    .select("*")
    .eq("contact_id", contactId)
    .eq("org_id", membership.orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return (data ?? []) as OutreachEntry[];
}

export async function createContact(
  contactData: Partial<Omit<Contact, "id" | "org_id" | "created_at" | "updated_at">> & {
    first_name: string;
  },
) {
  const { membership, user } = await getAuthenticatedMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("mktg_contacts")
    .insert({
      ...contactData,
      org_id: membership.orgId,
      owner_id: user.id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return data as Contact;
}

export async function updateContact(
  contactId: string,
  updates: Partial<Omit<Contact, "id" | "org_id" | "created_at" | "updated_at">>,
) {
  const { membership } = await getAuthenticatedMembership();
  const supabase = await createClient();

  // Only allow user-modifiable fields
  const allowedUpdates: Record<string, unknown> = {};
  const ALLOWED_FIELDS = [
    "first_name", "last_name", "email", "phone", "company", "title",
    "contact_type", "status", "lifecycle_stage", "tags", "location",
    "source", "persona", "notes",
  ] as const;
  for (const field of ALLOWED_FIELDS) {
    if (field in updates) {
      allowedUpdates[field] = updates[field as keyof typeof updates];
    }
  }

  const { data, error } = await supabase
    .from("mktg_contacts")
    .update(allowedUpdates)
    .eq("id", contactId)
    .eq("org_id", membership.orgId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return data as Contact;
}
