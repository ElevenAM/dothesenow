import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getOrgById,
  reserveCredits,
  confirmCredits,
  refundByReference,
  createDocDirect,
} from "@dothesenow/queries";
import type { OrgContext } from "@dothesenow/queries";
import type { Industry, BudgetTier } from "@dothesenow/types";
import {
  selectFrameworks,
  assembleStrategyPrompt,
  validateGaccsOutput,
  buildCorrectionPrompt,
  STRATEGY_GENERATION_COST,
} from "@dothesenow/prompts";
import type { GenerationMetadata, OrgProfile } from "@dothesenow/prompts";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6-20250514";
const MAX_TOKENS = 8192;

/**
 * Update the placeholder doc's generation_metadata for Realtime progress.
 * Best-effort: logs a warning on failure but does not throw, since
 * progress tracking is degraded-but-functional.
 */
async function updateProgress(
  supabase: ReturnType<typeof createAdminClient>,
  docId: string,
  metadata: GenerationMetadata,
): Promise<void> {
  const { error } = await supabase
    .from("mktg_strategy_docs")
    .update({ generation_metadata: metadata })
    .eq("id", docId);

  if (error) {
    console.warn(
      `[inngest:strategy] Progress update failed for doc ${docId}:`,
      error.message,
    );
  }
}

/**
 * Strategy generation — LLM-powered marketing strategy creation via Inngest.
 *
 * 7-step durable workflow:
 * 1. Load org + insert placeholder doc for Realtime progress
 * 2. Select frameworks + assemble prompt
 * 3. Reserve credits
 * 4. Call Claude API
 * 5. Validate output + retry with correction if needed (LLM-only step)
 * 6. Save strategy doc (DB-only step — safe to retry without re-calling LLM)
 * 7. Confirm credits
 *
 * On failure: mark placeholder doc as failed + refund credits.
 */
export const strategyGeneration = inngest.createFunction(
  {
    id: "strategy-generation",
    triggers: [{ event: "strategy/generate" }],
    concurrency: [{ limit: 3 }],
    rateLimit: { limit: 2, period: "1h", key: "event.data.org_id" },
    idempotency: "event.data.generation_id",
    retries: 1,
    onFailure: async ({ event, error }) => {
      const { org_id, generation_id } = event.data.event.data as {
        org_id: string;
        generation_id: string;
      };
      console.error(
        `[inngest:strategy] Function failed for org ${org_id}:`,
        error.message,
      );

      const supabase = createAdminClient();

      // Update placeholder doc if it exists — best-effort cleanup
      const { error: updateError } = await supabase
        .from("mktg_strategy_docs")
        .update({
          generation_metadata: {
            status: "failed",
            error: error.message,
          } satisfies GenerationMetadata,
        })
        .eq("org_id", org_id)
        .eq("is_active", true)
        .eq("doc_type", "master_strategy")
        .not("generation_metadata", "is", null);

      if (updateError) {
        console.error(
          `[inngest:strategy] Failed to mark doc as failed for org ${org_id}:`,
          updateError.message,
        );
      }

      // Refund any reserved credits
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      try {
        await refundByReference(ctx, generation_id);
      } catch (refundErr) {
        console.error(
          `[inngest:strategy] Credit refund failed for generation ${generation_id}:`,
          refundErr,
        );
      }
    },
  },
  async ({ event, step }) => {
    const { org_id, triggered_by, generation_id } = event.data;
    const supabase = createAdminClient();

    // Step 1: Load org + create placeholder doc for Realtime progress
    const { org, placeholderDocId } = await step.run("load-org", async () => {
      const orgRecord = await getOrgById(supabase, org_id);

      if (!orgRecord) throw new Error(`Organization ${org_id} not found`);
      if (!orgRecord.industry) throw new Error("Organization has no industry set — complete onboarding first");
      if (!orgRecord.budget_tier) throw new Error("Organization has no budget tier set — complete onboarding first");

      // Insert placeholder strategy doc so Realtime listeners can track progress.
      // Capture the doc ID for all subsequent UPDATEs — avoids composite key
      // matching multiple rows if Inngest retries this step.
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      const docId = await createDocDirect(ctx, {
        doc_type: "master_strategy",
        title: "Generating Marketing Strategy...",
        content: "",
        change_summary: "AI generation in progress",
        changed_by: triggered_by,
      });

      // Set initial generation_metadata on the placeholder
      await updateProgress(supabase, docId, { status: "generating" });

      return { org: orgRecord, placeholderDocId: docId };
    });

    // Step 2: Select frameworks + assemble prompt
    const promptResult = await step.run("build-prompt", async () => {
      const industry = org.industry as Industry;
      const budgetTier = org.budget_tier as BudgetTier;

      const selectedFrameworks = selectFrameworks(industry, budgetTier);

      const profile: OrgProfile = {
        industry,
        budgetTier,
        stage: org.stage,
        growthMotion: org.growth_motion,
        name: org.name,
      };

      const { systemPrompt, userPrompt } = assembleStrategyPrompt(
        profile,
        selectedFrameworks,
      );

      // Update placeholder with framework info
      await updateProgress(supabase, placeholderDocId, {
        status: "generating",
        frameworksSelected: selectedFrameworks,
      });

      return { selectedFrameworks, systemPrompt, userPrompt };
    });

    // Step 3: Reserve credits
    const ledgerId = await step.run("reserve-credits", async () => {
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      return reserveCredits(
        ctx,
        STRATEGY_GENERATION_COST,
        `strategy-generation:${generation_id}`,
        generation_id,
      );
    });

    // Step 4: Call Claude API
    const claudeResult = await step.run("call-claude", async () => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

      const startTime = Date.now();
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: promptResult.systemPrompt,
        messages: [{ role: "user", content: promptResult.userPrompt }],
      });

      const generatedContent = response.content
        .filter(
          (block): block is Anthropic.TextBlock => block.type === "text",
        )
        .map((block) => block.text)
        .join("\n\n");

      return {
        content: generatedContent,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        durationMs: Date.now() - startTime,
      };
    });

    // Step 5: Validate output + retry with correction prompt if needed
    // This is an LLM-only step — separated from save so DB retry doesn't re-call Claude.
    const validatedContent = await step.run("validate-output", async () => {
      const budgetTier = org.budget_tier as BudgetTier;

      await updateProgress(supabase, placeholderDocId, {
        status: "validating",
        model: claudeResult.model,
        inputTokens: claudeResult.inputTokens,
        outputTokens: claudeResult.outputTokens,
        durationMs: claudeResult.durationMs,
        frameworksSelected: promptResult.selectedFrameworks,
      });

      let finalContent = claudeResult.content;
      let validation = validateGaccsOutput(finalContent, budgetTier);
      let retryCount = 0;

      // One retry with correction prompt if validation fails
      if (!validation.valid) {
        console.warn(
          "[inngest:strategy] Validation failed, retrying with corrections:",
          validation.errors,
        );
        retryCount = 1;

        const correctionPrompt = buildCorrectionPrompt(
          finalContent,
          validation.errors,
        );

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

        const anthropic = new Anthropic({ apiKey });
        const retryResponse = await anthropic.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: promptResult.systemPrompt,
          messages: [
            { role: "user", content: promptResult.userPrompt },
            { role: "assistant", content: finalContent },
            { role: "user", content: correctionPrompt },
          ],
        });

        finalContent = retryResponse.content
          .filter(
            (block): block is Anthropic.TextBlock => block.type === "text",
          )
          .map((block) => block.text)
          .join("\n\n");

        validation = validateGaccsOutput(finalContent, budgetTier);
      }

      return {
        content: finalContent,
        retryCount,
        valid: validation.valid,
        validationErrors: validation.errors,
      };
    });

    // Step 6: Save strategy doc (DB-only — safe to retry without re-calling LLM)
    const saveResult = await step.run("save-doc", async () => {
      const status: GenerationMetadata["status"] = validatedContent.valid
        ? "completed"
        : "completed_with_warnings";

      const metadata: GenerationMetadata = {
        status,
        model: claudeResult.model,
        inputTokens: claudeResult.inputTokens,
        outputTokens: claudeResult.outputTokens,
        durationMs: claudeResult.durationMs,
        frameworksSelected: promptResult.selectedFrameworks,
        retryCount: validatedContent.retryCount,
        validationErrors: validatedContent.valid
          ? undefined
          : validatedContent.validationErrors,
      };

      // Update the placeholder doc with real content, filtering by ID
      const { error: updateError } = await supabase
        .from("mktg_strategy_docs")
        .update({
          title: "AI-Generated Marketing Strategy",
          content: validatedContent.content,
          change_summary: "Generated by AI strategy engine",
          generation_metadata: metadata,
        })
        .eq("id", placeholderDocId);

      if (updateError) {
        throw new Error(
          `Failed to save strategy doc: ${updateError.message}`,
        );
      }

      return { status };
    });

    // Step 7: Confirm credits
    await step.run("confirm-credits", async () => {
      const ctx: OrgContext = { client: supabase, orgId: org_id };
      await confirmCredits(ctx, ledgerId);
    });

    return {
      success: true,
      org_id,
      generation_id,
      placeholderDocId,
      status: saveResult.status,
      retryCount: validatedContent.retryCount,
      durationMs: claudeResult.durationMs,
    };
  },
);
