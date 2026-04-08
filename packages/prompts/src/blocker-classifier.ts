import type { BlockerClassificationResult } from "@dothesenow/types";
import type { ValidationResult } from "./types.js";

const BLOCKER_TYPES = [
  "knowledge_gap",
  "dependency",
  "skill_gap",
  "resource_constraint",
  "decision_needed",
] as const;

// ─── Few-shot examples (#1, #4, #7, #10, #13 from corpus) ──────

const FEW_SHOT_EXAMPLES = `
Example 1:
Task: "Write blog post comparing our pricing to Competitor X"
Blocker: "I can't find Competitor X's current pricing anywhere on their site — it says 'Contact Sales' for all tiers."
Classification: {"blocker_type":"knowledge_gap","blocker_type_secondary":null,"confidence":0.95,"reasoning":"The information exists (Competitor X has pricing) but we don't have access to it. Research Agent can search review sites, G2, or cached pages."}

Example 2:
Task: "Publish the case study blog post"
Blocker: "Waiting on the customer (Acme Corp) to approve the final draft. Sent for review 3 days ago, no response."
Classification: {"blocker_type":"dependency","blocker_type_secondary":null,"confidence":0.97,"reasoning":"Blocked on an external party's action. Resolution is escalation: remind, follow up, offer alternative."}

Example 3:
Task: "Create an animated explainer video for the landing page"
Blocker: "I don't know how to use After Effects or any video editing tools. I'm a content writer."
Classification: {"blocker_type":"skill_gap","blocker_type_secondary":null,"confidence":0.96,"reasoning":"The task is clear but the assignee lacks the technical skill. Draft Agent generates a brief, then reassign to a capable executor."}

Example 4:
Task: "Run a $500/month Google Ads campaign targeting 'project management software'"
Blocker: "Our total monthly marketing budget is $800 and we're already spending $400 on other channels. We can't allocate $500 to Google Ads."
Classification: {"blocker_type":"resource_constraint","blocker_type_secondary":null,"confidence":0.94,"reasoning":"Insufficient budget. Resolution: replan with smaller budget, target cheaper long-tail keywords, or defer."}

Example 5:
Task: "Choose the hero messaging for the homepage"
Blocker: "We have three strong positioning options: 'Save 10 hours/week', 'Your AI marketing team', and 'Marketing on autopilot'. The team is split. Need founder to decide."
Classification: {"blocker_type":"decision_needed","blocker_type_secondary":null,"confidence":0.98,"reasoning":"Multiple valid options, no clear winner, strategic decision. Surface to org owner via approval queue with a recommendation."}
`.trim();

const TIEBREAKER_RULES = `
Tiebreaker rules for multi-type blockers:
1. Ask: What is the ROOT CAUSE? If removing one type unblocks the task, that's the primary.
2. Hierarchy: dependency > decision_needed > resource_constraint > skill_gap > knowledge_gap
   - If blocked on a person AND a decision: classify as dependency (the person is the bottleneck)
   - If blocked on budget AND skill: classify as skill_gap if a cheaper approach exists, else resource_constraint
3. Compliance blockers: Always classify legal/regulatory review dependencies as dependency, not knowledge_gap. Route to escalation, not research.
4. Tag secondary type: Output primary type + optional secondary type for routing.
`.trim();

/**
 * Assemble the blocker classifier prompt from task and blocker descriptions.
 */
export function assembleClassifierPrompt(
  taskTitle: string,
  taskDescription: string,
  blockerDescription: string,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a marketing task blocker classifier. Given a task description and a blocker description, classify the blocker into exactly one primary type from: knowledge_gap, dependency, skill_gap, resource_constraint, decision_needed.

Type definitions:
- knowledge_gap: Missing information needed to proceed. The answer exists but we don't have it yet.
- dependency: Blocked on another person, team, or external deliverable. Can't proceed until they act.
- skill_gap: The assignee lacks the skill or tool proficiency to execute. The task itself is clear.
- resource_constraint: Insufficient budget, credits, tool access, or time to execute as planned.
- decision_needed: A strategic or tactical decision must be made before work can continue. Multiple valid paths.

${TIEBREAKER_RULES}

Respond with a JSON object containing:
- blocker_type: string (one of the 5 types)
- blocker_type_secondary: string | null (optional secondary type)
- confidence: number (0.0 to 1.0)
- reasoning: string (explain why this classification was chosen)

Here are classified examples:

${FEW_SHOT_EXAMPLES}

Respond ONLY with valid JSON. No markdown fences, no extra text.`;

  const userPrompt = `Classify this blocker:

Task: "${taskTitle}"
${taskDescription ? `Task Description: "${taskDescription}"` : ""}
Blocker: "${blockerDescription}"

Classification:`;

  return { systemPrompt, userPrompt };
}

/**
 * Validate the raw LLM output against expected classification structure.
 */
export function validateClassifierResult(
  rawOutput: string,
): ValidationResult & { result?: BlockerClassificationResult } {
  const errors: string[] = [];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawOutput.trim());
  } catch {
    return { valid: false, errors: ["Output is not valid JSON"] };
  }

  // Validate blocker_type
  const blockerType = parsed.blocker_type;
  if (typeof blockerType !== "string" || !BLOCKER_TYPES.includes(blockerType as (typeof BLOCKER_TYPES)[number])) {
    errors.push(
      `blocker_type must be one of: ${BLOCKER_TYPES.join(", ")}. Got: ${String(blockerType)}`,
    );
  }

  // Validate blocker_type_secondary (optional)
  const secondary = parsed.blocker_type_secondary;
  if (
    secondary !== null &&
    secondary !== undefined &&
    (typeof secondary !== "string" || !BLOCKER_TYPES.includes(secondary as (typeof BLOCKER_TYPES)[number]))
  ) {
    errors.push(
      `blocker_type_secondary must be null or one of: ${BLOCKER_TYPES.join(", ")}. Got: ${String(secondary)}`,
    );
  }

  // Validate confidence
  const confidence = parsed.confidence;
  if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
    errors.push(
      `confidence must be a number between 0 and 1. Got: ${String(confidence)}`,
    );
  }

  // Validate reasoning
  const reasoning = parsed.reasoning;
  if (typeof reasoning !== "string" || reasoning.trim().length === 0) {
    errors.push("reasoning must be a non-empty string");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    result: {
      blocker_type: blockerType as BlockerClassificationResult["blocker_type"],
      blocker_type_secondary: (secondary ?? null) as BlockerClassificationResult["blocker_type_secondary"],
      confidence: confidence as number,
      reasoning: reasoning as string,
    },
  };
}

/**
 * Build a correction prompt for a retry attempt.
 */
export function buildClassifierCorrectionPrompt(
  originalOutput: string,
  errors: string[],
): string {
  return `Your previous classification had issues:

${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}

Your previous output was:
${originalOutput}

Please output a corrected JSON classification. Respond ONLY with valid JSON, no markdown fences or extra text.`;
}
