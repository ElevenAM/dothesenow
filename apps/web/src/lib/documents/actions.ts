"use server";

import { revalidateTag } from "next/cache";
import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getDocumentsForOrg,
  getDocumentById,
  getDocumentsForEntity,
  createDocument,
  updateDocument,
  softDeleteDocument,
  generateSignedUploadUrl,
  generateSignedDownloadUrl,
  deleteStorageObject,
  isAllowedFileType,
} from "@dothesenow/queries";
import type {
  Document,
  CreateDocumentInput,
  UpdateDocumentInput,
} from "@dothesenow/types";
import type { DocumentFilters, DocumentEntityType } from "@dothesenow/types";

export type { Document } from "@dothesenow/types";
export type { PaginatedDocuments } from "@dothesenow/queries";

export async function getDocuments(
  filters?: DocumentFilters,
) {
  const { ctx } = await getAuthenticatedOrgContext();
  return getDocumentsForOrg(ctx, filters);
}

export async function getDocument(documentId: string) {
  const { ctx } = await getAuthenticatedOrgContext();
  return getDocumentById(ctx, documentId);
}

export async function getEntityDocuments(
  entityType: DocumentEntityType,
  entityId: string,
) {
  const { ctx } = await getAuthenticatedOrgContext();
  return getDocumentsForEntity(ctx, entityType, entityId);
}

export async function prepareUpload(
  fileName: string,
  fileType: string,
  fileSize?: number,
) {
  if (!isAllowedFileType(fileType)) {
    throw new Error(`File type "${fileType}" is not allowed`);
  }

  const { auth } = await getAuthenticatedOrgContext();
  const admin = createAdminClient();

  // Enforce plan-based document limits
  const { getPlanLimits } = await import("@dothesenow/types");
  const limits = getPlanLimits(auth.org.plan as import("@dothesenow/types").PlanTier);

  // Check document count limit
  if (limits.documents !== -1) {
    const { count } = await admin
      .from("dtn_documents")
      .select("id", { count: "exact", head: true })
      .eq("org_id", auth.membership.orgId)
      .is("deleted_at", null);

    if ((count ?? 0) >= limits.documents) {
      throw new Error(
        `Document limit reached (${count}/${limits.documents}). Upgrade your plan to upload more.`,
      );
    }
  }

  // Check per-file size limit
  if (fileSize && limits.maxFileSizeMb !== -1) {
    const maxBytes = limits.maxFileSizeMb * 1024 * 1024;
    if (fileSize > maxBytes) {
      throw new Error(
        `File exceeds ${limits.maxFileSizeMb} MB limit for your plan. Upgrade to upload larger files.`,
      );
    }
  }

  const documentId = crypto.randomUUID();

  const { signedUrl, path } = await generateSignedUploadUrl(
    admin,
    auth.membership.orgId,
    documentId,
    fileName,
  );

  return { signedUrl, path, documentId };
}

export async function finalizeUpload(
  input: CreateDocumentInput,
): Promise<Document> {
  const { auth } = await getAuthenticatedOrgContext();
  const admin = createAdminClient();

  const doc = await createDocument(admin, auth.membership.orgId, {
    ...input,
    uploaded_by: auth.user.id,
  });

  // Extract text from DOCX files for AI context
  if (
    input.file_type ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    try {
      const { data: fileBlob } = await admin.storage
        .from("org-documents")
        .download(input.storage_path);

      if (fileBlob) {
        const mammoth = await import("mammoth");
        const buffer = Buffer.from(await fileBlob.arrayBuffer());
        const result = await mammoth.extractRawText({ buffer });

        if (result.value) {
          await admin
            .from("dtn_documents")
            .update({ extracted_text: result.value })
            .eq("id", doc.id);
        }
      }
    } catch (err) {
      console.warn(
        `[documents] DOCX text extraction failed for ${doc.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  revalidateTag("documents", "max");
  return doc;
}

export async function updateDocumentMetadata(
  documentId: string,
  updates: UpdateDocumentInput,
): Promise<Document> {
  const { auth } = await getAuthenticatedOrgContext();
  const admin = createAdminClient();
  const doc = await updateDocument(admin, auth.membership.orgId, documentId, updates);
  revalidateTag("documents", "max");
  return doc;
}

export async function removeDocument(documentId: string): Promise<void> {
  const { ctx, auth } = await getAuthenticatedOrgContext();
  const admin = createAdminClient();

  // Fetch the document to get storage path
  const doc = await getDocumentById(ctx, documentId);
  if (!doc) throw new Error("Document not found");

  // Soft delete the record
  await softDeleteDocument(admin, auth.membership.orgId, documentId);

  // Remove from storage
  await deleteStorageObject(admin, doc.storage_path);

  revalidateTag("documents", "max");
}

export async function getDownloadUrl(documentId: string): Promise<string> {
  const { ctx } = await getAuthenticatedOrgContext();
  const admin = createAdminClient();

  const doc = await getDocumentById(ctx, documentId);
  if (!doc) throw new Error("Document not found");

  return generateSignedDownloadUrl(admin, doc.storage_path);
}
