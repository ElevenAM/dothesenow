import type { DraftResult } from "@dothesenow/types";
import type { ValidationResult } from "./types.js";

/**
 * Assemble the draft agent prompt for skill_gap blockers.
 * Generates templates, briefs, or drafts the assignee can use or hand off.
 */
export function assembleDraftPrompt(
  taskTitle: string,
  taskDescription: string,
  blockerDescription: string,
  strategyContext: string | null,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a marketing content specialist. Given a task blocked by a skill gap, generate a ready-to-use template, brief, or draft that helps the assignee complete the task or hand it off to a capable executor.

Your output MUST be a JSON object with:
- draft_type: string (e.g., "ad_copy_template", "creative_brief", "email_template", "requirements_spec", "storyboard")
- content: string (the actual template/brief/draft, minimum 50 characters)
- usage_instructions: string (how the assignee should use this draft)
- alternative_approaches: string[] (2-3 simpler alternatives if the original task is too complex)

CONSTRAINTS:
- The draft must be immediately actionable — not just advice about what to create.
- Include specific placeholders like [Company Name], [Key Metric], etc. where customization is needed.
- Content should follow marketing best practices for the specific format.
- Alternative approaches should be genuinely simpler, not just variations.

Respond ONLY with valid JSON. No markdown fences, no extra text.`;

  const parts = [
    `## Blocked Task`,
    `Task: "${taskTitle}"`,
  ];

  if (taskDescription) {
    parts.push(`Description: "${taskDescription}"`);
  }

  parts.push(`Skill gap: "${blockerDescription}"`);

  if (strategyContext) {
    parts.push(
      "",
      "## Organization Strategy Context (for brand voice and positioning reference)",
      strategyContext.length > 3000
        ? strategyContext.slice(0, 3000) + "\n\n[Truncated]"
        : strategyContext,
    );
  }

  parts.push("", "Generate a draft or template to help unblock this task:");

  return { systemPrompt, userPrompt: parts.join("\n") };
}

/**
 * Validate the raw LLM output against expected draft result structure.
 */
export function validateDraftResult(
  rawOutput: string,
): ValidationResult & { result?: DraftResult } {
  const errors: string[] = [];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawOutput.trim());
  } catch {
    return { valid: false, errors: ["Output is not valid JSON"] };
  }

  // Validate draft_type
  const draftType = parsed.draft_type;
  if (typeof draftType !== "string" || draftType.trim().length === 0) {
    errors.push("draft_type must be a non-empty string");
  }

  // Validate content (minimum 50 chars)
  const content = parsed.content;
  if (typeof content !== "string" || content.trim().length < 50) {
    errors.push(
      `content must be a string with at least 50 characters. Got: ${typeof content === "string" ? content.length : 0} characters`,
    );
  }

  // Validate usage_instructions
  const instructions = parsed.usage_instructions;
  if (typeof instructions !== "string" || instructions.trim().length === 0) {
    errors.push("usage_instructions must be a non-empty string");
  }

  // Validate alternative_approaches
  const alternatives = parsed.alternative_approaches;
  if (!Array.isArray(alternatives)) {
    errors.push("alternative_approaches must be an array of strings");
  } else if (alternatives.some((a) => typeof a !== "string")) {
    errors.push("All alternative_approaches entries must be strings");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    result: {
      draft_type: draftType as string,
      content: content as string,
      usage_instructions: instructions as string,
      alternative_approaches: alternatives as string[],
    },
  };
}

/**
 * Build a correction prompt for a retry attempt.
 */
export function buildDraftCorrectionPrompt(
  originalOutput: string,
  errors: string[],
): string {
  return `Your previous draft output had structural issues:

${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}

Your previous output was:
${originalOutput}

Please output a corrected JSON draft result. Respond ONLY with valid JSON, no markdown fences or extra text.`;
}
