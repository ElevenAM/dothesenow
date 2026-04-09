"use server";

import { revalidatePath } from "next/cache";
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

export async function prepareUpload(fileName: string, fileType: string) {
  if (!isAllowedFileType(fileType)) {
    throw new Error(`File type "${fileType}" is not allowed`);
  }

  const { auth } = await getAuthenticatedOrgContext();
  const admin = createAdminClient();
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

  revalidatePath("/");
  return doc;
}

export async function updateDocumentMetadata(
  documentId: string,
  updates: UpdateDocumentInput,
): Promise<Document> {
  const { auth } = await getAuthenticatedOrgContext();
  const admin = createAdminClient();
  const doc = await updateDocument(admin, auth.membership.orgId, documentId, updates);
  revalidatePath("/");
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

  revalidatePath("/");
}

export async function getDownloadUrl(documentId: string): Promise<string> {
  const { ctx } = await getAuthenticatedOrgContext();
  const admin = createAdminClient();

  const doc = await getDocumentById(ctx, documentId);
  if (!doc) throw new Error("Document not found");

  return generateSignedDownloadUrl(admin, doc.storage_path);
}
