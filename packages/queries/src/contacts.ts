import type { OrgContext } from "./context.js";
import type {
  Contact,
  OutreachEntry,
  PipelineSummary,
  CreateContactInput,
  UpdateContactInput,
  LogOutreachInput,
  ContactFilters,
  OutreachFilters,
} from "@dothesenow/types";
import { QueryError } from "./errors.js";

const CONTACTS_TABLE = "mktg_contacts";
const OUTREACH_TABLE = "mktg_outreach_log";
const DEFAULT_PAGE_SIZE = 20;

/** Escape PostgREST filter special characters to prevent filter injection. */
export function escapeFilterValue(value: string): string {
  return value.replace(/[\\%_(),."]/g, (ch) => `\\${ch}`);
}

export interface PaginatedContacts {
  contacts: Contact[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getContactsForOrg(
  ctx: OrgContext,
  filters?: ContactFilters & { page?: number; pageSize?: number },
): Promise<PaginatedContacts> {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  let query = ctx.client
    .from(CONTACTS_TABLE)
    .select("*", { count: "exact" })
    .eq("org_id", ctx.orgId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (filters?.search) {
    const escaped = escapeFilterValue(filters.search);
    const term = `%${escaped}%`;
    query = query.or(
      `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},company.ilike.${term},notes.ilike.${term}`,
    );
  }
  if (filters?.contact_type) {
    query = query.eq("contact_type", filters.contact_type);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.lifecycle_stage) {
    query = query.eq("lifecycle_stage", filters.lifecycle_stage);
  }
  if (filters?.owner_id) {
    query = query.eq("owner_id", filters.owner_id);
  }
  if (filters?.source) {
    const escapedSource = escapeFilterValue(filters.source);
    query = query.ilike("source", `%${escapedSource}%`);
  }
  if (filters?.tags && filters.tags.length > 0) {
    query = query.overlaps("tags", filters.tags);
  }
  if (filters?.not_contacted_since_days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - filters.not_contacted_since_days);
    const cutoffStr = cutoff.toISOString();
    query = query.or(`last_engaged.is.null,last_engaged.lt.${cutoffStr}`);
  }

  const { data, count, error } = await query;

  if (error) throw new QueryError(error.message, CONTACTS_TABLE, "getContactsForOrg", ctx.orgId, error);

  return {
    contacts: (data ?? []) as Contact[],
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  };
}

export async function getContactById(
  ctx: OrgContext,
  contactId: string,
): Promise<Contact | null> {
  const { data, error } = await ctx.client
    .from(CONTACTS_TABLE)
    .select("*")
    .eq("id", contactId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (error) throw new QueryError(error.message, CONTACTS_TABLE, "getContactById", ctx.orgId, error);
  return data as Contact | null;
}

export async function getOutreachLog(
  ctx: OrgContext,
  contactId: string,
  limit = 50,
): Promise<OutreachEntry[]> {
  const { data, error } = await ctx.client
    .from(OUTREACH_TABLE)
    .select("*")
    .eq("contact_id", contactId)
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new QueryError(error.message, OUTREACH_TABLE, "getOutreachLog", ctx.orgId, error);
  return (data ?? []) as OutreachEntry[];
}

export async function createContact(
  ctx: OrgContext,
  contact: CreateContactInput & { owner_id?: string },
): Promise<Contact> {
  const { data, error } = await ctx.client
    .from(CONTACTS_TABLE)
    .insert({
      ...contact,
      org_id: ctx.orgId,
    })
    .select()
    .single();

  if (error) throw new QueryError(error.message, CONTACTS_TABLE, "createContact", ctx.orgId, error);
  return data as Contact;
}

export async function updateContact(
  ctx: OrgContext,
  contactId: string,
  updates: UpdateContactInput,
): Promise<Contact> {
  const { data, error } = await ctx.client
    .from(CONTACTS_TABLE)
    .update(updates)
    .eq("id", contactId)
    .eq("org_id", ctx.orgId)
    .select()
    .single();

  if (error) throw new QueryError(error.message, CONTACTS_TABLE, "updateContact", ctx.orgId, error);
  return data as Contact;
}

export async function logOutreach(
  ctx: OrgContext,
  entry: LogOutreachInput,
): Promise<OutreachEntry> {
  const { data, error } = await ctx.client
    .from(OUTREACH_TABLE)
    .insert({
      ...entry,
      org_id: ctx.orgId,
      direction: entry.direction ?? "outbound",
    })
    .select()
    .single();

  if (error) throw new QueryError(error.message, OUTREACH_TABLE, "logOutreach", ctx.orgId, error);

  // Update the contact's last_engaged timestamp
  const { error: engageError } = await ctx.client
    .from(CONTACTS_TABLE)
    .update({ last_engaged: new Date().toISOString() })
    .eq("id", entry.contact_id)
    .eq("org_id", ctx.orgId);

  if (engageError) {
    console.error("logOutreach: failed to update last_engaged", engageError);
  }

  return data as OutreachEntry;
}

const PIPELINE_VIEW = "mktg_pipeline_summary";

export async function getPipelineSummary(
  ctx: OrgContext,
): Promise<PipelineSummary[]> {
  const { data, error } = await ctx.client
    .from(PIPELINE_VIEW)
    .select("*")
    .eq("org_id", ctx.orgId);

  if (error) throw new QueryError(error.message, PIPELINE_VIEW, "getPipelineSummary", ctx.orgId, error);
  return (data ?? []) as PipelineSummary[];
}

/**
 * Get outreach history with flexible filtering.
 * contactId is optional — omit it to get outreach across all contacts.
 */
export async function getOutreachHistory(
  ctx: OrgContext,
  filters?: OutreachFilters,
): Promise<(OutreachEntry & { mktg_contacts?: { first_name: string; last_name: string | null; email: string | null; company: string | null } | null })[]> {
  let query = ctx.client
    .from(OUTREACH_TABLE)
    .select("*, mktg_contacts(first_name, last_name, email, company)")
    .eq("org_id", ctx.orgId);

  if (filters?.contact_id) query = query.eq("contact_id", filters.contact_id);
  if (filters?.channel) query = query.eq("channel", filters.channel);
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.since_days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - filters.since_days);
    query = query.gte("sent_at", cutoff.toISOString());
  }

  const { data, error } = await query
    .order("sent_at", { ascending: false })
    .limit(filters?.limit ?? 50);

  if (error) throw new QueryError(error.message, OUTREACH_TABLE, "getOutreachHistory", ctx.orgId, error);
  return data ?? [];
}
