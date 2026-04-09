import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgContext } from "./context.js";
import type {
  ContactImport,
  CreateImportInput,
  ImportProgressUpdate,
} from "@dothesenow/types";
import { QueryError } from "./errors.js";

const TABLE = "dtn_contact_imports";

// ─── Read queries ───────────────────────────────────────────

export async function getImportsForOrg(
  ctx: OrgContext,
  limit = 20,
): Promise<ContactImport[]> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new QueryError(error.message, TABLE, "getImportsForOrg", ctx.orgId, error);
  }

  return (data ?? []) as ContactImport[];
}

export async function getImport(
  ctx: OrgContext,
  importId: string,
): Promise<ContactImport | null> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("id", importId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (error) {
    throw new QueryError(error.message, TABLE, "getImport", ctx.orgId, error);
  }

  return (data as ContactImport) ?? null;
}

// ─── Write queries (admin client) ───────────────────────────

export async function createImport(
  adminClient: SupabaseClient,
  orgId: string,
  input: CreateImportInput,
): Promise<ContactImport> {
  const { data, error } = await adminClient
    .from(TABLE)
    .insert({
      org_id: orgId,
      file_name: input.file_name,
      storage_path: input.storage_path,
      column_mapping: input.column_mapping,
      total_rows: input.total_rows,
      uploaded_by: input.uploaded_by ?? null,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    throw new QueryError(error.message, TABLE, "createImport", orgId, error);
  }

  return data as ContactImport;
}

export async function updateImportProgress(
  adminClient: SupabaseClient,
  importId: string,
  updates: ImportProgressUpdate,
): Promise<void> {
  const { error } = await adminClient
    .from(TABLE)
    .update(updates)
    .eq("id", importId);

  if (error) {
    throw new QueryError(error.message, TABLE, "updateImportProgress", "", error);
  }
}

/**
 * Check if an import has been cancelled. Used by the Inngest function
 * at the start of each batch step to support early exit.
 */
export async function isImportCancelled(
  adminClient: SupabaseClient,
  importId: string,
): Promise<boolean> {
  const { data, error } = await adminClient
    .from(TABLE)
    .select("status")
    .eq("id", importId)
    .single();

  if (error) {
    throw new QueryError(error.message, TABLE, "isImportCancelled", "", error);
  }

  return data?.status === "cancelled";
}
