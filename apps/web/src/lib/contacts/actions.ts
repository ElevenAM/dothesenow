"use server";

import { revalidateTag } from "next/cache";
import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import {
  getContactsForOrg,
  getContactById,
  getOutreachLog,
  logOutreach as sharedLogOutreach,
  createContact as sharedCreateContact,
  updateContact as sharedUpdateContact,
  ALLOWED_CONTACT_UPDATE_FIELDS,
  createImport,
  getImportsForOrg,
  getImport,
  updateImportProgress,
  type PaginatedContacts,
} from "@dothesenow/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import type {
  Contact,
  OutreachEntry,
  ContactFilters,
  ContactImport,
  CreateContactInput,
  UpdateContactInput,
  LogOutreachInput,
} from "@dothesenow/types";

export type { Contact, OutreachEntry, ContactImport } from "@dothesenow/types";
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
  revalidateTag("contacts", "max");
  return contact;
}

export async function updateContact(
  contactId: string,
  updates: Partial<Record<string, unknown>>,
): Promise<Contact> {
  const { ctx } = await getAuthenticatedOrgContext();

  // Only allow user-modifiable fields (security boundary)
  // Whitelist imported from @dothesenow/queries (single source of truth)
  const filtered: Record<string, unknown> = {};
  for (const field of ALLOWED_CONTACT_UPDATE_FIELDS) {
    if (field in updates) {
      filtered[field] = updates[field];
    }
  }

  const contact = await sharedUpdateContact(ctx, contactId, filtered as UpdateContactInput);
  revalidateTag("contacts", "max");
  return contact;
}

export async function logContactOutreach(
  contactId: string,
  entry: Omit<LogOutreachInput, "contact_id">,
): Promise<OutreachEntry> {
  const { ctx } = await getAuthenticatedOrgContext();
  const result = await sharedLogOutreach(ctx, { ...entry, contact_id: contactId });
  revalidateTag("contacts", "max");
  return result;
}

// ─── CSV Import actions ────────────────────────────────────

export async function startContactImport(input: {
  file_name: string;
  storage_path: string;
  column_mapping: Record<string, string>;
  total_rows: number;
}): Promise<ContactImport> {
  const { auth, ctx } = await getAuthenticatedOrgContext();
  const adminClient = createAdminClient();

  const importRecord = await createImport(adminClient, ctx.orgId, {
    ...input,
    uploaded_by: auth.user.id,
  });

  await inngest.send({
    name: "contacts/import.requested",
    data: {
      import_id: importRecord.id,
      org_id: ctx.orgId,
      storage_path: input.storage_path,
    },
  });

  return importRecord;
}

export async function getContactImports(): Promise<ContactImport[]> {
  const { ctx } = await getAuthenticatedOrgContext();
  return getImportsForOrg(ctx);
}

export async function getContactImport(importId: string): Promise<ContactImport | null> {
  const { ctx } = await getAuthenticatedOrgContext();
  return getImport(ctx, importId);
}

export async function cancelContactImport(importId: string): Promise<void> {
  const { ctx } = await getAuthenticatedOrgContext();

  // Verify the import belongs to this org
  const record = await getImport(ctx, importId);
  if (!record) throw new Error("Import not found");
  if (record.status !== "processing" && record.status !== "pending") {
    throw new Error("Import cannot be cancelled in its current state");
  }

  const adminClient = createAdminClient();
  await updateImportProgress(adminClient, importId, { status: "cancelled" });
  revalidateTag("contacts", "max");
}
