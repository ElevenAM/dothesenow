import { describe, it, expect } from "vitest";
import {
  assembleClassifierPrompt,
  validateClassifierResult,
  buildClassifierCorrectionPrompt,
} from "../blocker-classifier.js";

// ─── Corpus fixtures (from blocker-classifier-corpus.md) ────────

const CORPUS = [
  { id: 1, task: "Write blog post comparing our pricing to Competitor X", blocker: "I can't find Competitor X's current pricing anywhere", expected: "knowledge_gap" },
  { id: 2, task: "Create Instagram ad targeting for our fitness audience", blocker: "I don't know what audience demographics perform best for fitness DTC brands on Meta", expected: "knowledge_gap" },
  { id: 3, task: "Set up email welcome series for new signups", blocker: "What's our current average time-to-first-action for new users?", expected: "knowledge_gap" },
  { id: 4, task: "Publish the case study blog post", blocker: "Waiting on the customer (Acme Corp) to approve the final draft", expected: "dependency" },
  { id: 5, task: "Launch Meta retargeting campaign", blocker: "The Meta pixel hasn't been installed on our site yet. Dev team said they'd do it last sprint", expected: "dependency" },
  { id: 6, task: "Send the weekly newsletter", blocker: "The product team hasn't shared the feature update copy they promised", expected: "dependency" },
  { id: 7, task: "Create an animated explainer video for the landing page", blocker: "I don't know how to use After Effects or any video editing tools", expected: "skill_gap" },
  { id: 8, task: "Build a custom analytics dashboard in Looker", blocker: "I've never used Looker before and don't know LookML", expected: "skill_gap" },
  { id: 9, task: "Write Facebook ad copy variations for A/B testing", blocker: "I've never written paid ad copy before", expected: "skill_gap" },
  { id: 10, task: "Run a $500/month Google Ads campaign", blocker: "Our total monthly marketing budget is $800 and we're already spending $400 on other channels", expected: "resource_constraint" },
  { id: 11, task: "Generate 20 SEO-optimized blog posts this month", blocker: "We only have 50 AI credits left and each blog post uses ~5 credits", expected: "resource_constraint" },
  { id: 12, task: "Hire a freelance designer for the landing page redesign", blocker: "We don't have a Fiverr or Upwork account set up, and the org hasn't allocated budget", expected: "resource_constraint" },
  { id: 13, task: "Choose the hero messaging for the homepage", blocker: "We have three strong positioning options. The team is split. Need founder to decide.", expected: "decision_needed" },
  { id: 14, task: "Set up the referral program structure", blocker: "Should the referral reward be a credit, an extended trial, or a percentage discount?", expected: "decision_needed" },
  { id: 15, task: "Plan the content calendar for Q2", blocker: "Are we pivoting to target enterprise customers this quarter, or staying focused on SMB?", expected: "decision_needed" },
];

// ─── assembleClassifierPrompt ───────────────────────────────────

describe("assembleClassifierPrompt", () => {
  it("returns systemPrompt and userPrompt strings", () => {
    const { systemPrompt, userPrompt } = assembleClassifierPrompt(
      "Write a blog post",
      "About SEO best practices",
      "I don't know what keywords to target",
    );
    expect(typeof systemPrompt).toBe("string");
    expect(typeof userPrompt).toBe("string");
    expect(systemPrompt.length).toBeGreaterThan(200);
  });

  it("system prompt includes all 5 blocker type definitions", () => {
    const { systemPrompt } = assembleClassifierPrompt("Task", "", "Blocker");
    expect(systemPrompt).toContain("knowledge_gap");
    expect(systemPrompt).toContain("dependency");
    expect(systemPrompt).toContain("skill_gap");
    expect(systemPrompt).toContain("resource_constraint");
    expect(systemPrompt).toContain("decision_needed");
  });

  it("system prompt includes few-shot examples", () => {
    const { systemPrompt } = assembleClassifierPrompt("Task", "", "Blocker");
    expect(systemPrompt).toContain("Example 1:");
    expect(systemPrompt).toContain("Example 5:");
    expect(systemPrompt).toContain("Competitor X");
    expect(systemPrompt).toContain("Acme Corp");
  });

  it("system prompt includes tiebreaker rules", () => {
    const { systemPrompt } = assembleClassifierPrompt("Task", "", "Blocker");
    expect(systemPrompt).toContain("Tiebreaker");
    expect(systemPrompt).toContain("dependency > decision_needed > resource_constraint");
  });

  it("user prompt includes task and blocker descriptions", () => {
    const { userPrompt } = assembleClassifierPrompt(
      "Run Google Ads",
      "PPC campaign",
      "Budget is too low",
    );
    expect(userPrompt).toContain("Run Google Ads");
    expect(userPrompt).toContain("PPC campaign");
    expect(userPrompt).toContain("Budget is too low");
  });

  it("user prompt works without task description", () => {
    const { userPrompt } = assembleClassifierPrompt(
      "Write a blog post",
      "",
      "Can't find competitor pricing",
    );
    expect(userPrompt).toContain("Write a blog post");
    expect(userPrompt).toContain("Can't find competitor pricing");
    expect(userPrompt).not.toContain("Task Description");
  });
});

// ─── validateClassifierResult ───────────────────────────────────

describe("validateClassifierResult", () => {
  it("accepts valid classification JSON", () => {
    const result = validateClassifierResult(
      JSON.stringify({
        blocker_type: "knowledge_gap",
        blocker_type_secondary: null,
        confidence: 0.95,
        reasoning: "The information exists but we don't have it.",
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.result?.blocker_type).toBe("knowledge_gap");
    expect(result.result?.confidence).toBe(0.95);
  });

  it("accepts valid classification with secondary type", () => {
    const result = validateClassifierResult(
      JSON.stringify({
        blocker_type: "skill_gap",
        blocker_type_secondary: "resource_constraint",
        confidence: 0.82,
        reasoning: "Primary is skill gap, secondary is budget.",
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.result?.blocker_type_secondary).toBe("resource_constraint");
  });

  it("rejects invalid JSON", () => {
    const result = validateClassifierResult("not json");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Output is not valid JSON");
  });

  it("rejects invalid blocker_type", () => {
    const result = validateClassifierResult(
      JSON.stringify({
        blocker_type: "unknown_type",
        blocker_type_secondary: null,
        confidence: 0.9,
        reasoning: "Reason",
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("blocker_type must be one of");
  });

  it("rejects out-of-range confidence", () => {
    const result = validateClassifierResult(
      JSON.stringify({
        blocker_type: "dependency",
        blocker_type_secondary: null,
        confidence: 1.5,
        reasoning: "Reason",
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("confidence must be a number between 0 and 1");
  });

  it("rejects empty reasoning", () => {
    const result = validateClassifierResult(
      JSON.stringify({
        blocker_type: "dependency",
        blocker_type_secondary: null,
        confidence: 0.9,
        reasoning: "",
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("reasoning must be a non-empty string");
  });

  it("rejects invalid secondary type", () => {
    const result = validateClassifierResult(
      JSON.stringify({
        blocker_type: "dependency",
        blocker_type_secondary: "not_real",
        confidence: 0.9,
        reasoning: "Reason",
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("blocker_type_secondary");
  });

  it("handles confidence of exactly 0 and 1", () => {
    const zero = validateClassifierResult(
      JSON.stringify({ blocker_type: "dependency", blocker_type_secondary: null, confidence: 0, reasoning: "Low confidence" }),
    );
    expect(zero.valid).toBe(true);

    const one = validateClassifierResult(
      JSON.stringify({ blocker_type: "dependency", blocker_type_secondary: null, confidence: 1, reasoning: "High confidence" }),
    );
    expect(one.valid).toBe(true);
  });
});

// ─── buildClassifierCorrectionPrompt ────────────────────────────

describe("buildClassifierCorrectionPrompt", () => {
  it("includes all errors and original output", () => {
    const errors = [
      "blocker_type must be one of: knowledge_gap, dependency...",
      "confidence must be a number between 0 and 1",
    ];
    const prompt = buildClassifierCorrectionPrompt('{"bad":"json"}', errors);
    expect(prompt).toContain("blocker_type must be one of");
    expect(prompt).toContain("confidence must be a number");
    expect(prompt).toContain('{"bad":"json"}');
  });
});

// ─── Corpus coverage (prompt structure per blocker type) ────────

describe("corpus coverage", () => {
  it.each(CORPUS)(
    "assembles valid prompt for corpus example #$id ($expected)",
    ({ task, blocker }) => {
      const { systemPrompt, userPrompt } = assembleClassifierPrompt(task, "", blocker);
      expect(systemPrompt.length).toBeGreaterThan(200);
      expect(userPrompt).toContain(task);
      expect(userPrompt).toContain(blocker);
    },
  );
});
