"use server";

import { revalidateTag } from "next/cache";
import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import { trackServerEvent } from "@/lib/analytics";
import {
  getStrategyDocs as sharedGetStrategyDocs,
  getDocById,
  getDocHistory,
  createDoc,
  updateDoc,
  deleteStrategyDoc as sharedDeleteStrategyDoc,
} from "@dothesenow/queries";
import type { StrategyDoc, DocType } from "@dothesenow/types";

export type { DocType, StrategyDoc } from "@dothesenow/types";

export async function getStrategyDocs(): Promise<StrategyDoc[]> {
  const { ctx } = await getAuthenticatedOrgContext();
  return sharedGetStrategyDocs(ctx);
}

export async function getStrategyDoc(docId: string): Promise<StrategyDoc> {
  const { ctx } = await getAuthenticatedOrgContext();
  const doc = await getDocById(ctx, docId);
  if (!doc) throw new Error("Document not found");
  return doc;
}

export async function getVersionHistory(
  docType: string,
): Promise<Pick<StrategyDoc, "id" | "version" | "change_summary" | "changed_by" | "created_at" | "title">[]> {
  const { ctx } = await getAuthenticatedOrgContext();
  return getDocHistory(ctx, docType);
}

export async function createStrategyDoc(
  docType: DocType,
  title: string,
  content: string,
  tags: string[] = [],
): Promise<string> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  const docId = await createDoc(ctx, {
    doc_type: docType,
    title,
    content,
    tags,
    changed_by: auth.user.id,
  });

  trackServerEvent(auth.user.id, "strategy_doc_created", { orgId: ctx.orgId, docType });

  revalidateTag("strategy", "max");
  return docId;
}

export async function deleteStrategyDoc(docType: string): Promise<void> {
  const { ctx } = await getAuthenticatedOrgContext(["owner", "admin"]);
  await sharedDeleteStrategyDoc(ctx, docType);
  revalidateTag("strategy", "max");
}

export async function updateStrategyDoc(
  docId: string,
  title: string,
  content: string,
  changeSummary: string,
  tags: string[] = [],
): Promise<string> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  const newDocId = await updateDoc(ctx, docId, {
    title,
    content,
    change_summary: changeSummary || "Updated",
    changed_by: auth.user.id,
    tags,
  });

  revalidateTag("strategy", "max");
  return newDocId;
}
