import type { ResearchResult } from "@dothesenow/types";
import type { ValidationResult } from "./types.js";

/**
 * Assemble the research agent prompt for knowledge_gap blockers.
 * Uses the org's active strategy document as internal context.
 */
export function assembleResearchPrompt(
  taskTitle: string,
  taskDescription: string,
  blockerDescription: string,
  strategyContext: string | null,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a marketing research assistant. Given a blocked marketing task and an information gap, produce structured research findings that will help unblock the task.

Your output MUST be a JSON object with:
- findings: string[] (3-8 specific, actionable findings)
- sources: string[] (where the information was found or should be looked up)
- recommended_action: string (what the user should do next with these findings)
- confidence: number (0.0-1.0, how confident you are that these findings address the blocker)

CONSTRAINTS:
- Be specific to the marketing context described. Generic advice is a failing.
- If you don't have enough information to fully resolve the blocker, say so in recommended_action and suggest where the user can find the missing data.
- Prefer actionable findings over theoretical background.

Respond ONLY with valid JSON. No markdown fences, no extra text.`;

  const parts = [
    `## Blocked Task`,
    `Task: "${taskTitle}"`,
  ];

  if (taskDescription) {
    parts.push(`Description: "${taskDescription}"`);
  }

  parts.push(`Blocker (information gap): "${blockerDescription}"`);

  if (strategyContext) {
    parts.push(
      "",
      "## Organization Strategy Context (for internal reference)",
      strategyContext.length > 4000
        ? strategyContext.slice(0, 4000) + "\n\n[Truncated — full strategy available internally]"
        : strategyContext,
    );
  }

  parts.push("", "Research this blocker and provide structured findings:");

  return { systemPrompt, userPrompt: parts.join("\n") };
}

/**
 * Validate the raw LLM output against expected research result structure.
 */
export function validateResearchResult(
  rawOutput: string,
): ValidationResult & { result?: ResearchResult } {
  const errors: string[] = [];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawOutput.trim());
  } catch {
    return { valid: false, errors: ["Output is not valid JSON"] };
  }

  // Validate findings
  const findings = parsed.findings;
  if (!Array.isArray(findings) || findings.length === 0) {
    errors.push("findings must be a non-empty array of strings");
  } else if (findings.some((f) => typeof f !== "string" || f.trim().length === 0)) {
    errors.push("All findings entries must be non-empty strings");
  }

  // Validate sources
  const sources = parsed.sources;
  if (!Array.isArray(sources)) {
    errors.push("sources must be an array of strings");
  }

  // Validate recommended_action
  const action = parsed.recommended_action;
  if (typeof action !== "string" || action.trim().length === 0) {
    errors.push("recommended_action must be a non-empty string");
  }

  // Validate confidence
  const confidence = parsed.confidence;
  if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
    errors.push(`confidence must be a number between 0 and 1. Got: ${String(confidence)}`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    result: {
      findings: findings as string[],
      sources: sources as string[],
      recommended_action: action as string,
      confidence: confidence as number,
    },
  };
}

/**
 * Build a correction prompt for a retry attempt.
 */
export function buildResearchCorrectionPrompt(
  originalOutput: string,
  errors: string[],
): string {
  return `Your previous research output had structural issues:

${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}

Your previous output was:
${originalOutput}

Please output a corrected JSON research result. Respond ONLY with valid JSON, no markdown fences or extra text.`;
}
