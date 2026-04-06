import type { OrgContext } from "./context.js";
import type {
  Contact,
  OutreachEntry,
  CreateContactInput,
  UpdateContactInput,
  LogOutreachInput,
  ContactFilters,
} from "@dothesenow/types";
import { QueryError } from "./errors.js";

const CONTACTS_TABLE = "mktg_contacts";
const OUTREACH_TABLE = "mktg_outreach_log";
const DEFAULT_PAGE_SIZE = 20;

/** Escape PostgREST filter special characters to prevent filter injection. */
function escapeFilterValue(value: string): string {
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
      `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},company.ilike.${term}`,
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
  return data as OutreachEntry;
}
