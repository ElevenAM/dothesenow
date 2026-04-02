"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

const DOC_TYPES = [
  "master_strategy",
  "competitive_analysis",
  "value_props",
  "brand_voice",
  "personas",
  "positioning",
  "content_calendar",
  "channel_strategy",
  "pricing_strategy",
  "playbook",
  "other",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export interface StrategyDoc {
  id: string;
  org_id: string;
  doc_type: DocType;
  title: string;
  content: string;
  version: number;
  tags: string[];
  previous_version_id: string | null;
  change_summary: string | null;
  changed_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getStrategyDocs(): Promise<StrategyDoc[]> {
  const { membership } = await getAuthenticatedMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("mktg_strategy_docs")
    .select("*")
    .eq("org_id", membership.orgId)
    .eq("is_active", true)
    .order("doc_type")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as StrategyDoc[];
}

export async function getStrategyDoc(docId: string): Promise<StrategyDoc> {
  const { membership } = await getAuthenticatedMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("mktg_strategy_docs")
    .select("*")
    .eq("id", docId)
    .eq("org_id", membership.orgId)
    .single();

  if (error) throw new Error(error.message);
  return data as StrategyDoc;
}

export async function getVersionHistory(
  docType: string,
): Promise<Pick<StrategyDoc, "id" | "version" | "change_summary" | "changed_by" | "created_at" | "title">[]> {
  const { membership } = await getAuthenticatedMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("mktg_strategy_docs")
    .select("id, version, change_summary, changed_by, created_at, title")
    .eq("org_id", membership.orgId)
    .eq("doc_type", docType)
    .order("version", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createStrategyDoc(
  docType: DocType,
  title: string,
  content: string,
  tags: string[] = [],
) {
  const { membership, user } = await getAuthenticatedMembership();
  const admin = createAdminClient();

  // Use the RPC function for atomic versioning
  const { data, error } = await admin.rpc("update_strategy_doc", {
    p_org_id: membership.orgId,
    p_doc_type: docType,
    p_title: title,
    p_content: content,
    p_change_summary: "Initial version",
    p_changed_by: user.id,
    p_tags: tags,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return data as string;
}

export async function updateStrategyDoc(
  docId: string,
  title: string,
  content: string,
  changeSummary: string,
  tags: string[] = [],
) {
  const { membership, user } = await getAuthenticatedMembership();
  const admin = createAdminClient();

  // Fetch current doc to get doc_type
  const { data: current, error: fetchError } = await admin
    .from("mktg_strategy_docs")
    .select("doc_type")
    .eq("id", docId)
    .eq("org_id", membership.orgId)
    .single();

  if (fetchError || !current) throw new Error("Document not found");

  // Use the RPC function for atomic versioning
  const { data, error } = await admin.rpc("update_strategy_doc", {
    p_org_id: membership.orgId,
    p_doc_type: current.doc_type,
    p_title: title,
    p_content: content,
    p_change_summary: changeSummary || "Updated",
    p_changed_by: user.id,
    p_tags: tags,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return data as string;
}
