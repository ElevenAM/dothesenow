import type { OrgContext } from "./context.js";
import type {
  StrategyDoc,
  CreateStrategyDocInput,
  UpdateStrategyDocInput,
  StrategyFilters,
} from "@dothesenow/types";
import { QueryError } from "./errors.js";
import { escapeFilterValue } from "./contacts.js";

const TABLE = "mktg_strategy_docs";

export async function getStrategyDocs(
  ctx: OrgContext,
  filters?: StrategyFilters,
): Promise<StrategyDoc[]> {
  let query = ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId);

  if (filters?.is_active !== undefined) {
    query = query.eq("is_active", filters.is_active);
  } else {
    query = query.eq("is_active", true);
  }
  if (filters?.doc_type) {
    query = query.eq("doc_type", filters.doc_type);
  }

  // Hide placeholder docs still being generated. Use `or` to preserve NULL rows
  // (manual/uploaded docs have no generation_metadata).
  query = query.or(
    "generation_metadata.is.null,generation_metadata->>status.not.in.(generating,validating)",
  );

  const { data, error } = await query
    .order("doc_type")
    .order("updated_at", { ascending: false });

  if (error) throw new QueryError(error.message, TABLE, "getStrategyDocs", ctx.orgId, error);
  return (data ?? []) as StrategyDoc[];
}

export async function getDocById(
  ctx: OrgContext,
  docId: string,
): Promise<StrategyDoc | null> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("id", docId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (error) throw new QueryError(error.message, TABLE, "getDocById", ctx.orgId, error);
  return data as StrategyDoc | null;
}

export async function getDocHistory(
  ctx: OrgContext,
  docType: string,
  limit = 20,
): Promise<Pick<StrategyDoc, "id" | "version" | "change_summary" | "changed_by" | "created_at" | "title">[]> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("id, version, change_summary, changed_by, created_at, title")
    .eq("org_id", ctx.orgId)
    .eq("doc_type", docType)
    .order("version", { ascending: false })
    .limit(limit);

  if (error) throw new QueryError(error.message, TABLE, "getDocHistory", ctx.orgId, error);
  return data ?? [];
}

/**
 * Create a strategy doc using the atomic RPC function.
 * The RPC handles versioning (deactivating old, inserting new).
 *
 * WARNING: The `update_strategy_doc` RPC requires `auth.uid()` — it will fail
 * with service_role clients (e.g. MCP server). Service-role callers must use
 * `createDocDirect()` instead (uses the `create_strategy_doc_direct` RPC).
 */
export async function createDoc(
  ctx: OrgContext,
  doc: CreateStrategyDocInput,
): Promise<string> {
  const { data, error } = await ctx.client.rpc("update_strategy_doc", {
    p_org_id: ctx.orgId,
    p_doc_type: doc.doc_type,
    p_title: doc.title,
    p_content: doc.content,
    p_change_summary: "Initial version",
    p_changed_by: doc.changed_by ?? null,
    p_tags: doc.tags ?? [],
  });

  if (error) throw new QueryError(error.message, TABLE, "createDoc", ctx.orgId, error);
  return data as string;
}

/**
 * Update a strategy doc using the atomic RPC function.
 * Requires fetching the current doc_type first, then calling the RPC.
 *
 * WARNING: Requires `auth.uid()` — will not work with service_role clients.
 * Service-role callers must use `createDocDirect()` instead.
 */
export async function updateDoc(
  ctx: OrgContext,
  docId: string,
  updates: UpdateStrategyDocInput,
): Promise<string> {
  // Fetch current doc to get doc_type
  const current = await getDocById(ctx, docId);
  if (!current) throw new QueryError("Document not found", TABLE, "updateDoc", ctx.orgId);

  const { data, error } = await ctx.client.rpc("update_strategy_doc", {
    p_org_id: ctx.orgId,
    p_doc_type: current.doc_type,
    p_title: updates.title ?? current.title,
    p_content: updates.content ?? current.content,
    p_change_summary: updates.change_summary ?? null,
    p_changed_by: updates.changed_by ?? null,
    p_tags: updates.tags ?? current.tags ?? [],
  });

  if (error) throw new QueryError(error.message, TABLE, "updateDoc", ctx.orgId, error);
  return data as string;
}

/**
 * Create/update a strategy doc using the atomic RPC that does NOT require auth.uid().
 * Uses create_strategy_doc_direct() which handles deactivate → version → insert
 * atomically with FOR UPDATE locking.
 *
 * Safe for service_role callers (MCP server, edge functions).
 */
export async function createDocDirect(
  ctx: OrgContext,
  input: CreateStrategyDocInput & { change_summary?: string },
): Promise<string> {
  const { data, error } = await ctx.client.rpc("create_strategy_doc_direct", {
    p_org_id: ctx.orgId,
    p_doc_type: input.doc_type,
    p_title: input.title,
    p_content: input.content,
    p_change_summary: input.change_summary ?? null,
    p_changed_by: input.changed_by ?? "claude",
    p_tags: input.tags ?? [],
  });

  if (error) throw new QueryError(error.message, TABLE, "createDocDirect", ctx.orgId, error);
  return data as string;
}

/**
 * Soft-delete a strategy doc by deactivating all versions of a given doc_type.
 * Guards against deleting while generation is in progress.
 */
export async function deleteStrategyDoc(
  ctx: OrgContext,
  docType: string,
): Promise<void> {
  // Guard: block delete if an active doc of this type is mid-generation
  const { data: generating } = await ctx.client
    .from(TABLE)
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("doc_type", docType)
    .eq("is_active", true)
    .in("generation_metadata->>status", ["generating", "validating"])
    .limit(1);

  if (generating && generating.length > 0) {
    throw new QueryError(
      "Cannot delete while strategy is being generated. Please wait for generation to complete.",
      TABLE,
      "deleteStrategyDoc",
      ctx.orgId,
    );
  }

  const { error } = await ctx.client
    .from(TABLE)
    .update({ is_active: false })
    .eq("org_id", ctx.orgId)
    .eq("doc_type", docType);

  if (error) {
    throw new QueryError(error.message, TABLE, "deleteStrategyDoc", ctx.orgId, error);
  }
}

/**
 * Text search across active strategy docs.
 * Uses ilike for content matching.
 */
export async function searchStrategyDocs(
  ctx: OrgContext,
  query: string,
  filters?: { doc_types?: string[]; limit?: number },
): Promise<Pick<StrategyDoc, "id" | "doc_type" | "title" | "content" | "version" | "updated_at">[]> {
  const escaped = escapeFilterValue(query);
  let q = ctx.client
    .from(TABLE)
    .select("id, doc_type, title, content, version, updated_at")
    .eq("org_id", ctx.orgId)
    .eq("is_active", true)
    .ilike("content", `%${escaped}%`);

  if (filters?.doc_types) {
    q = q.in("doc_type", filters.doc_types);
  }

  const { data, error } = await q.limit(filters?.limit ?? 5);

  if (error) throw new QueryError(error.message, TABLE, "searchStrategyDocs", ctx.orgId, error);
  return data ?? [];
}
