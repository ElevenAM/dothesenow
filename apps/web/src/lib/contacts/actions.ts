"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import {
  getContactsForOrg,
  getContactById,
  getOutreachLog,
  createContact as sharedCreateContact,
  updateContact as sharedUpdateContact,
  type PaginatedContacts,
} from "@dothesenow/queries";
import type {
  Contact,
  OutreachEntry,
  ContactFilters,
  CreateContactInput,
  UpdateContactInput,
} from "@dothesenow/types";

export type { Contact, OutreachEntry } from "@dothesenow/types";
export type { PaginatedContacts } from "@dothesenow/queries";

/** Accepts string-typed filter values from search params and forwards to shared queries. */
export async function searchContacts(
  filters: {
    search?: string;
    contact_type?: string;
    status?: string;
    lifecycle_stage?: string;
    page?: number;
  } = {},
): Promise<PaginatedContacts> {
  const { ctx } = await getAuthenticatedOrgContext();
  return getContactsForOrg(ctx, filters as ContactFilters & { page?: number });
}

export async function getContact(contactId: string): Promise<Contact> {
  const { ctx } = await getAuthenticatedOrgContext();
  const contact = await getContactById(ctx, contactId);
  if (!contact) throw new Error("Contact not found");
  return contact;
}

export async function getOutreachHistory(contactId: string): Promise<OutreachEntry[]> {
  const { ctx } = await getAuthenticatedOrgContext();
  return getOutreachLog(ctx, contactId);
}

export async function createContact(
  contactData: Partial<Record<string, unknown>> & { first_name: string },
): Promise<Contact> {
  const { auth, ctx } = await getAuthenticatedOrgContext();
  const contact = await sharedCreateContact(ctx, {
    ...(contactData as CreateContactInput),
    owner_id: auth.user.id,
  });
  revalidatePath("/", "layout");
  return contact;
}

const ALLOWED_UPDATE_FIELDS = [
  "first_name", "last_name", "email", "phone", "company", "title",
  "contact_type", "status", "lifecycle_stage", "tags", "location",
  "source", "persona", "notes",
] as const;

export async function updateContact(
  contactId: string,
  updates: Partial<Record<string, unknown>>,
): Promise<Contact> {
  const { ctx } = await getAuthenticatedOrgContext();

  // Only allow user-modifiable fields (security boundary)
  const filtered: Record<string, unknown> = {};
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (field in updates) {
      filtered[field] = updates[field];
    }
  }

  const contact = await sharedUpdateContact(ctx, contactId, filtered as UpdateContactInput);
  revalidatePath("/", "layout");
  return contact;
}
