"use server";

import { revalidateTag } from "next/cache";

/** Map Supabase table names → cache tags used by unstable_cache wrappers. */
const TABLE_TO_TAGS: Record<string, string> = {
  dtn_daily_tasks: "tasks",
  mktg_contacts: "contacts",
  dtn_approval_queue: "approvals",
  mktg_strategy_docs: "strategy",
  dtn_experiments: "results",
  mktg_blog_posts: "blog",
  dtn_documents: "documents",
};

/**
 * Invalidate server-side cached data for a given table.
 * Called from the RealtimeListener before router.refresh() so the
 * subsequent RSC re-render fetches fresh data instead of stale cache.
 */
export async function invalidateCacheForTable(
  table: string,
  _orgId: string,
): Promise<void> {
  const tag = TABLE_TO_TAGS[table];
  if (tag) {
    revalidateTag(tag, "max");
  }
  // Also invalidate overview stats since they aggregate across tables
  revalidateTag("overview", "max");
  // Invalidate credit balance when strategy docs change (generation deducts credits)
  if (table === "mktg_strategy_docs") {
    revalidateTag("credits", "max");
  }
}
