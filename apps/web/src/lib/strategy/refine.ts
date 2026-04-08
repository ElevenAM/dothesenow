"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import {
  getCreditBalance,
  getStrategyDocs,
  createDocDirect,
  reviewApproval,
} from "@dothesenow/queries";
import { inngest } from "@/lib/inngest/client";
import { STRATEGY_REFINEMENT_COST } from "@dothesenow/prompts";
import type { SuggestionApplyStatus, RefinementSuggestion } from "@dothesenow/prompts";
import { createAdminClient } from "@/lib/supabase/admin";

export { STRATEGY_REFINEMENT_COST };

// ─── Manual trigger ────────────────────────────────────────────

export async function requestRefinement(): Promise<{
  success: boolean;
  error?: string;
  refinementId?: string;
}> {
  const { auth, ctx } = await getAuthenticatedOrgContext();
  const { org } = auth;

  if (!org.industry) {
    return {
      success: false,
      error: "Please complete onboarding — industry is required for strategy refinement.",
    };
  }
  if (!org.budgetTier) {
    return {
      success: false,
      error: "Please complete onboarding — budget tier is required for strategy refinement.",
    };
  }

  // Check active strategy exists
  const docs = await getStrategyDocs(ctx, {
    is_active: true,
    doc_type: "master_strategy",
  });
  if (docs.length === 0) {
    return {
      success: false,
      error: "No active marketing strategy found. Generate a strategy first.",
    };
  }

  // Pre-flight credit check
  const { remaining } = await getCreditBalance(ctx);
  if (remaining !== -1 && remaining < STRATEGY_REFINEMENT_COST) {
    return {
      success: false,
      error: `Insufficient credits. Refinement costs ${STRATEGY_REFINEMENT_COST} credits, but you have ${remaining} remaining.`,
    };
  }

  const refinementId = crypto.randomUUID();

  await inngest.send({
    name: "strategy/refine",
    data: {
      org_id: ctx.orgId,
      triggered_by: auth.user.id,
      refinement_id: refinementId,
    },
  });

  return { success: true, refinementId };
}

// ─── Apply suggestions ─────────────────────────────────────────

export interface SuggestionDecision {
  index: number;
  decision: "accepted" | "rejected" | "modified";
  modified_text?: string;
}

export interface ApplyResult {
  success: boolean;
  error?: string;
  newDocId?: string;
  applyResults?: {
    applied: number;
    fallback: number;
    failed: number;
  };
}

export async function applyRefinementSuggestions(
  runId: string,
  decisions: SuggestionDecision[],
): Promise<ApplyResult> {
  const { auth, ctx } = await getAuthenticatedOrgContext();

  // Use admin client for the atomic claim since the user's client
  // may not have UPDATE permission on dtn_refinement_runs
  const adminClient = createAdminClient();

  // Atomic claim: prevent double-apply race condition
  const { data: claimed, error: claimError } = await adminClient
    .from("dtn_refinement_runs")
    .update({ applied_doc_id: "00000000-0000-0000-0000-000000000000" }) // placeholder UUID for claiming
    .eq("id", runId)
    .eq("org_id", ctx.orgId)
    .is("applied_doc_id", null)
    .select("id, strategy_doc_id, raw_suggestions, approval_id")
    .single();

  if (claimError || !claimed) {
    return {
      success: false,
      error: "This refinement has already been applied or is being processed.",
    };
  }

  const suggestions = claimed.raw_suggestions as RefinementSuggestion[];
  const acceptedDecisions = decisions.filter((d) => d.decision !== "rejected");

  // If all rejected, just update the run record
  if (acceptedDecisions.length === 0) {
    await adminClient
      .from("dtn_refinement_runs")
      .update({
        decisions: decisions,
        applied_doc_id: null, // clear the claim — no doc created
      })
      .eq("id", runId);

    // Mark approval as rejected
    if (claimed.approval_id) {
      const adminCtx = { client: adminClient, orgId: ctx.orgId };
      await reviewApproval(adminCtx, claimed.approval_id, auth.user.id, {
        status: "rejected",
        reviewer_notes: "All suggestions rejected",
      });
    }

    revalidatePath("/", "layout");
    return { success: true, applyResults: { applied: 0, fallback: 0, failed: 0 } };
  }

  // Load the current active strategy doc to apply diffs
  const activeDocs = await getStrategyDocs(ctx, {
    is_active: true,
    doc_type: "master_strategy",
  });
  if (activeDocs.length === 0) {
    return { success: false, error: "No active strategy doc found." };
  }

  let content = activeDocs[0].content;
  const statuses: SuggestionApplyStatus[] = new Array(suggestions.length).fill("applied");
  let applied = 0;
  let fallback = 0;
  let failed = 0;

  // Apply accepted/modified diffs to content
  for (const decision of decisions) {
    if (decision.decision === "rejected") {
      statuses[decision.index] = "applied"; // not applicable — skipped
      continue;
    }

    const suggestion = suggestions[decision.index];
    if (!suggestion) {
      statuses[decision.index] = "failed";
      failed++;
      continue;
    }

    const newText = decision.decision === "modified" && decision.modified_text
      ? decision.modified_text
      : suggestion.suggested_change;

    const result = applySuggestionToContent(content, suggestion, newText);
    content = result.content;
    statuses[decision.index] = result.status;

    if (result.status === "applied") applied++;
    else if (result.status === "fallback") fallback++;
    else failed++;
  }

  // Create new strategy doc version
  const adminCtx = { client: adminClient, orgId: ctx.orgId };
  const appliedCategories = acceptedDecisions
    .map((d) => suggestions[d.index]?.category)
    .filter(Boolean);

  const newDocId = await createDocDirect(adminCtx, {
    doc_type: "master_strategy",
    title: activeDocs[0].title,
    content,
    change_summary: `AI refinement: ${appliedCategories.join(", ")} (${applied} applied, ${fallback} annotations, ${failed} failed)`,
    changed_by: auth.user.id,
  });

  // Update run record with decisions + applied doc
  const decisionsWithStatus = decisions.map((d) => ({
    ...d,
    apply_status: statuses[d.index],
  }));

  await adminClient
    .from("dtn_refinement_runs")
    .update({
      decisions: decisionsWithStatus,
      applied_doc_id: newDocId,
    })
    .eq("id", runId);

  // Mark approval as approved
  if (claimed.approval_id) {
    await reviewApproval(adminCtx, claimed.approval_id, auth.user.id, {
      status: "approved",
      reviewer_notes: `Applied ${applied} of ${acceptedDecisions.length} suggestions`,
    });
  }

  revalidatePath("/", "layout");

  return {
    success: true,
    newDocId,
    applyResults: { applied, fallback, failed },
  };
}

// ─── Content patching ──────────────────────────────────────────

function applySuggestionToContent(
  content: string,
  suggestion: RefinementSuggestion,
  newText: string,
): { content: string; status: SuggestionApplyStatus } {
  // Attempt 1: Exact string replacement of current_state
  if (suggestion.current_state && content.includes(suggestion.current_state)) {
    return {
      content: content.replace(suggestion.current_state, newText),
      status: "applied",
    };
  }

  // Attempt 2: Fuzzy match — look for a substantial substring (first 60 chars)
  if (suggestion.current_state && suggestion.current_state.length > 20) {
    const fuzzyTarget = suggestion.current_state.substring(0, 60).trim();
    const idx = content.indexOf(fuzzyTarget);
    if (idx !== -1) {
      // Find the end of the sentence/paragraph containing the match
      const lineEnd = content.indexOf("\n", idx + fuzzyTarget.length);
      const endIdx = lineEnd !== -1 ? lineEnd : idx + suggestion.current_state.length;
      return {
        content: content.substring(0, idx) + newText + content.substring(endIdx),
        status: "applied",
      };
    }
  }

  // Attempt 3: Fallback — append annotation under the target section heading
  const sectionPattern = new RegExp(
    `(^|\\n)(#+\\s*${escapeRegex(suggestion.target_section)}.*)`,
    "i",
  );
  const sectionMatch = content.match(sectionPattern);

  if (sectionMatch && sectionMatch.index !== undefined) {
    const insertPos = sectionMatch.index + sectionMatch[0].length;
    const annotation = `\n\n> **AI Refinement Suggestion** [${suggestion.category}]:\n> ${newText}\n`;
    return {
      content: content.substring(0, insertPos) + annotation + content.substring(insertPos),
      status: "fallback",
    };
  }

  // Attempt 4: Last resort — append at end
  const annotation = `\n\n> **AI Refinement Suggestion** [${suggestion.category}] (${suggestion.target_section}):\n> ${newText}\n`;
  return {
    content: content + annotation,
    status: "fallback",
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
