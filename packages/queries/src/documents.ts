import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgContext } from "./context.js";
import type {
  Document,
  CreateDocumentInput,
  UpdateDocumentInput,
} from "@dothesenow/types";
import type { DocumentFilters, DocumentEntityType } from "@dothesenow/types";
import { QueryError } from "./errors.js";
import { escapeFilterValue } from "./contacts.js";

const TABLE = "dtn_documents";
const DEFAULT_PAGE_SIZE = 20;

const ENTITY_FK: Record<DocumentEntityType, string> = {
  contact: "contact_id",
  campaign: "campaign_id",
  strategy_doc: "strategy_doc_id",
  experiment: "experiment_id",
};

// ─── Read queries ───────────────────────────────────────────

export interface PaginatedDocuments {
  documents: Document[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getDocumentsForOrg(
  ctx: OrgContext,
  filters?: DocumentFilters,
): Promise<PaginatedDocuments> {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  let query = ctx.client
    .from(TABLE)
    .select("*", { count: "exact" })
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (filters?.search) {
    const escaped = escapeFilterValue(filters.search);
    const term = `%${escaped}%`;
    query = query.or(
      `title.ilike.${term},description.ilike.${term},file_name.ilike.${term}`,
    );
  }

  if (filters?.file_type) {
    query = query.ilike("file_type", `${filters.file_type}%`);
  }

  if (filters?.tags && filters.tags.length > 0) {
    query = query.overlaps("tags", filters.tags);
  }

  if (filters?.entity_type && filters?.entity_id) {
    const fk = ENTITY_FK[filters.entity_type];
    query = query.eq(fk, filters.entity_id);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new QueryError(error.message, TABLE, "getDocumentsForOrg", ctx.orgId, error);
  }

  const total = count ?? 0;

  return {
    documents: (data ?? []) as Document[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getDocumentById(
  ctx: OrgContext,
  documentId: string,
): Promise<Document | null> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("id", documentId)
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new QueryError(error.message, TABLE, "getDocumentById", ctx.orgId, error);
  }

  return (data as Document) ?? null;
}

export async function getDocumentsForEntity(
  ctx: OrgContext,
  entityType: DocumentEntityType,
  entityId: string,
): Promise<Document[]> {
  const fk = ENTITY_FK[entityType];

  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq(fk, entityId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new QueryError(error.message, TABLE, "getDocumentsForEntity", ctx.orgId, error);
  }

  return (data ?? []) as Document[];
}

// ─── Write queries (admin client) ───────────────────────────

export async function createDocument(
  adminClient: SupabaseClient,
  orgId: string,
  input: CreateDocumentInput,
): Promise<Document> {
  const { data, error } = await adminClient
    .from(TABLE)
    .insert({
      org_id: orgId,
      title: input.title,
      description: input.description ?? null,
      file_name: input.file_name,
      file_type: input.file_type,
      file_size: input.file_size,
      storage_path: input.storage_path,
      tags: input.tags ?? [],
      uploaded_by: input.uploaded_by ?? null,
      contact_id: input.contact_id ?? null,
      campaign_id: input.campaign_id ?? null,
      strategy_doc_id: input.strategy_doc_id ?? null,
      experiment_id: input.experiment_id ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw new QueryError(error.message, TABLE, "createDocument", orgId, error);
  }

  return data as Document;
}

export async function updateDocument(
  adminClient: SupabaseClient,
  orgId: string,
  documentId: string,
  updates: UpdateDocumentInput,
): Promise<Document> {
  const { data, error } = await adminClient
    .from(TABLE)
    .update(updates)
    .eq("id", documentId)
    .eq("org_id", orgId)
    .select("*")
    .single();

  if (error) {
    throw new QueryError(error.message, TABLE, "updateDocument", orgId, error);
  }

  return data as Document;
}

export async function softDeleteDocument(
  adminClient: SupabaseClient,
  orgId: string,
  documentId: string,
): Promise<void> {
  const { error } = await adminClient
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("org_id", orgId);

  if (error) {
    throw new QueryError(error.message, TABLE, "softDeleteDocument", orgId, error);
  }
}

// ─── AI context ────────────────────────────────────────────

export interface AiContextDocument {
  id: string;
  title: string;
  extracted_text: string;
}

/**
 * Fetch documents with extracted text for AI context injection.
 * Lightweight query — selects only id, title, extracted_text.
 * Excludes docs tagged with any tag in `excludeTags`.
 */
export async function getDocumentsForAiContext(
  ctx: OrgContext,
  options?: {
    excludeTags?: string[];
    limit?: number;
  },
): Promise<AiContextDocument[]> {
  let query = ctx.client
    .from(TABLE)
    .select("id, title, extracted_text")
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .not("extracted_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 20);

  if (options?.excludeTags && options.excludeTags.length > 0) {
    query = query.not("tags", "ov", `{${options.excludeTags.join(",")}}`);
  }

  const { data, error } = await query;
  if (error) throw new QueryError(error.message, TABLE, "getDocumentsForAiContext", ctx.orgId, error);
  return (data ?? []) as AiContextDocument[];
}

// ─── Storage helpers ────────────────────────────────────────

const BUCKET = "org-documents";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/svg+xml",
  "text/csv",
  "text/plain",
  "text/markdown",
]);

/** Human-readable label for the allowed file types (for UI hints). */
export const ALLOWED_FILE_TYPE_LABEL =
  "PDF, DOCX, XLSX, PNG, JPG, GIF, SVG, CSV, TXT, Markdown (max 50 MB)";

export function isAllowedFileType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.has(mimeType);
}

export async function generateSignedUploadUrl(
  adminClient: SupabaseClient,
  orgId: string,
  documentId: string,
  fileName: string,
): Promise<{ signedUrl: string; path: string }> {
  const path = `${orgId}/${documentId}/${fileName}`;

  const { data, error } = await adminClient.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error) {
    throw new QueryError(error.message, "storage", "generateSignedUploadUrl", orgId, error);
  }

  return { signedUrl: data.signedUrl, path };
}

export async function generateSignedDownloadUrl(
  adminClient: SupabaseClient,
  storagePath: string,
  expiresIn = 3600,
): Promise<string> {
  const { data, error } = await adminClient.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    throw new QueryError(error.message, "storage", "generateSignedDownloadUrl", "", error);
  }

  return data.signedUrl;
}

export async function downloadDocumentContent(
  adminClient: SupabaseClient,
  storagePath: string,
): Promise<Blob> {
  const { data, error } = await adminClient.storage
    .from(BUCKET)
    .download(storagePath);

  if (error) {
    throw new QueryError(error.message, "storage", "downloadDocumentContent", "", error);
  }

  return data;
}

export async function deleteStorageObject(
  adminClient: SupabaseClient,
  storagePath: string,
): Promise<void> {
  const { error } = await adminClient.storage
    .from(BUCKET)
    .remove([storagePath]);

  if (error) {
    throw new QueryError(error.message, "storage", "deleteStorageObject", "", error);
  }
}
