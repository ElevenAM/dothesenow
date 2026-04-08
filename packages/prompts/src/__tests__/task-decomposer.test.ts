import { describe, it, expect } from "vitest";
import {
  assembleDecompositionPrompt,
  validateDecompositionOutput,
  buildDecompositionCorrectionPrompt,
  extractChannelAllocations,
  extractTopExperiments,
} from "../task-decomposer.js";
import type { DecompositionContext, TeamMember } from "../types.js";

// ─── Test fixtures ──────────────────────────────────────────

const SOLO_FOUNDER_TEAM: TeamMember[] = [
  { userId: "u1", displayName: "Alice", specialties: [], role: "owner" },
];

const GROWTH_TEAM: TeamMember[] = [
  { userId: "u1", displayName: "Alice", specialties: ["growth_lead", "analytics"], role: "owner" },
  { userId: "u2", displayName: "Bob", specialties: ["content_writer", "seo"], role: "member" },
  { userId: "u3", displayName: "Carol", specialties: ["social_media", "design"], role: "member" },
];

const STRATEGY_CONTENT = `# B2B SaaS Marketing Strategy — Bootstrap

## Goals
- Establish product-market fit through organic acquisition
- Build repeatable inbound pipeline with <$1K/mo spend
- Achieve first 100 users through content and community

## Audience
- **Primary**: Technical decision-makers at startups
- **Secondary**: Non-technical founders

## Channels
1. **Content/SEO** (primary) — Long-tail blog posts
   - Budget: 40%
2. **LinkedIn** — Founder-led thought leadership
   - Budget: 35%
3. **Product-Led Growth** — Free tier with viral loops
   - Budget: 25%

## Content Pillars
- How-to guides
- Comparison posts
- Customer stories

## Schedule
### Months 1–2: Foundation
Publish 8 SEO articles. Set up LinkedIn cadence.
### Months 3–4: Amplification
Double down on top content. Start email list.
### Months 5–6: Optimization
Introduce referral program. Evaluate paid.

## Experiment Backlog (ICE Scored)

| Experiment | Impact | Confidence | Ease | ICE |
|-----------|--------|------------|------|-----|
| Publish 8 long-tail SEO articles | 8 | 6 | 7 | 21 |
| Founder LinkedIn posting 3x/week | 7 | 7 | 8 | 22 |
| Free tier with team invite loop | 9 | 5 | 5 | 19 |
| Comparison landing pages | 7 | 6 | 6 | 19 |
| Email drip from blog subscribers | 6 | 7 | 7 | 20 |
| Customer case study series | 7 | 5 | 6 | 18 |
| Guest posts on industry blogs | 5 | 4 | 5 | 14 |
| Referral program | 8 | 4 | 4 | 16 |`;

function makeCtx(overrides: Partial<DecompositionContext> = {}): DecompositionContext {
  return {
    org: {
      industry: "b2b_saas",
      budgetTier: "bootstrap",
      stage: "early",
      growthMotion: "product_led",
      name: "TestCo",
      teamSize: 1,
      timezone: "America/New_York",
    },
    strategyDocId: "doc-1",
    strategyContent: STRATEGY_CONTENT,
    yesterdayOutcomes: [],
    channelBalance: [],
    experimentProgress: [],
    team: SOLO_FOUNDER_TEAM,
    targetDate: "2026-04-07",
    dayOfWeek: 2, // Tuesday
    ...overrides,
  };
}

// ─── assembleDecompositionPrompt ────────────────────────────

describe("assembleDecompositionPrompt", () => {
  it("returns systemPrompt and userPrompt strings", () => {
    const { systemPrompt, userPrompt } = assembleDecompositionPrompt(makeCtx());
    expect(typeof systemPrompt).toBe("string");
    expect(typeof userPrompt).toBe("string");
    expect(systemPrompt.length).toBeGreaterThan(100);
    expect(userPrompt.length).toBeGreaterThan(200);
  });

  it("system prompt contains DoTheseNow role", () => {
    const { systemPrompt } = assembleDecompositionPrompt(makeCtx());
    expect(systemPrompt).toContain("DoTheseNow");
    expect(systemPrompt).toContain("marketing operations assistant");
  });

  it("system prompt includes compliance gate for fintech", () => {
    const ctx = makeCtx({ org: { ...makeCtx().org, industry: "fintech" } });
    const { systemPrompt } = assembleDecompositionPrompt(ctx);
    expect(systemPrompt).toContain("COMPLIANCE");
  });

  it("system prompt includes compliance gate for healthtech", () => {
    const ctx = makeCtx({ org: { ...makeCtx().org, industry: "healthtech" } });
    const { systemPrompt } = assembleDecompositionPrompt(ctx);
    expect(systemPrompt).toContain("HIPAA");
  });

  it("user prompt includes org context", () => {
    const { userPrompt } = assembleDecompositionPrompt(makeCtx());
    expect(userPrompt).toContain("TestCo");
    expect(userPrompt).toContain("b2b saas");
    expect(userPrompt).toContain("bootstrap");
  });

  it("user prompt includes day-of-week pattern for Tuesday", () => {
    const { userPrompt } = assembleDecompositionPrompt(makeCtx({ dayOfWeek: 2 }));
    expect(userPrompt).toContain("Tuesday");
    expect(userPrompt).toContain("Content creation");
  });

  it("user prompt includes Friday analysis pattern", () => {
    const { userPrompt } = assembleDecompositionPrompt(makeCtx({ dayOfWeek: 5 }));
    expect(userPrompt).toContain("Friday");
    expect(userPrompt).toContain("Analysis");
  });

  it("includes solo founder mode note when team_size=1 and bootstrap", () => {
    const { userPrompt } = assembleDecompositionPrompt(makeCtx());
    expect(userPrompt).toContain("Solo founder mode");
  });

  it("does not include solo founder mode for growth tier", () => {
    const ctx = makeCtx({
      org: { ...makeCtx().org, budgetTier: "growth", teamSize: 3 },
      team: GROWTH_TEAM,
    });
    const { userPrompt } = assembleDecompositionPrompt(ctx);
    expect(userPrompt).not.toContain("Solo founder mode");
  });

  it("includes team roster when team_size > 1", () => {
    const ctx = makeCtx({
      org: { ...makeCtx().org, budgetTier: "growth", teamSize: 3 },
      team: GROWTH_TEAM,
    });
    const { userPrompt } = assembleDecompositionPrompt(ctx);
    expect(userPrompt).toContain("Team Roster");
    expect(userPrompt).toContain("Bob");
    expect(userPrompt).toContain("content_writer");
    expect(userPrompt).toContain("recommended_assignee_role");
  });

  it("does not include team roster for solo founder", () => {
    const { userPrompt } = assembleDecompositionPrompt(makeCtx());
    expect(userPrompt).not.toContain("Team Roster");
  });

  it("includes carry-over items from yesterday", () => {
    const ctx = makeCtx({
      yesterdayOutcomes: [
        {
          taskId: "t1",
          title: "Write blog post draft",
          status: "failed",
          executorType: "claude_api",
          strategySection: "Channels.ContentSEO",
          experimentId: null,
          failureReason: "api_error",
        },
      ],
    });
    const { userPrompt } = assembleDecompositionPrompt(ctx);
    expect(userPrompt).toContain("Yesterday's Outcomes");
    expect(userPrompt).toContain("Write blog post draft");
    expect(userPrompt).toContain("FAILED");
    expect(userPrompt).toContain("retry");
  });

  it("includes channel balance data", () => {
    const ctx = makeCtx({
      channelBalance: [
        { channel: "ContentSEO", targetPct: 40, actualPct: 20 },
        { channel: "LinkedIn", targetPct: 35, actualPct: 50 },
      ],
    });
    const { userPrompt } = assembleDecompositionPrompt(ctx);
    expect(userPrompt).toContain("Channel Balance");
    expect(userPrompt).toContain("UNDER-REPRESENTED");
  });

  it("includes experiment progress data", () => {
    const ctx = makeCtx({
      experimentProgress: [
        { experimentId: "exp-1", experimentTitle: "SEO articles", completedSteps: 3, totalEstimatedSteps: 8 },
      ],
    });
    const { userPrompt } = assembleDecompositionPrompt(ctx);
    expect(userPrompt).toContain("Experiment Progress");
    expect(userPrompt).toContain("3/8");
  });

  it("includes executor heuristics", () => {
    const { userPrompt } = assembleDecompositionPrompt(makeCtx());
    expect(userPrompt).toContain("claude_api");
    expect(userPrompt).toContain("executor");
  });

  it("includes duration estimates", () => {
    const { userPrompt } = assembleDecompositionPrompt(makeCtx());
    expect(userPrompt).toContain("90 min");
    expect(userPrompt).toContain("Blog post draft");
  });
});

// ─── extractChannelAllocations ──────────────────────────────

describe("extractChannelAllocations", () => {
  it("parses Budget: XX% format", () => {
    const channels = extractChannelAllocations(STRATEGY_CONTENT);
    expect(channels.length).toBe(3);
    expect(channels[0]).toEqual({ name: "Content/SEO", pct: 40 });
    expect(channels[1]).toEqual({ name: "LinkedIn", pct: 35 });
    expect(channels[2]).toEqual({ name: "Product-Led Growth", pct: 25 });
  });

  it("falls back to equal distribution for onboarding template format", () => {
    const templateContent = `## Channels
1. **Content/SEO** (primary) — Long-tail blog posts
2. **LinkedIn** — Founder-led thought leadership
3. **Product-Led Growth** — Free tier with viral loops`;

    const channels = extractChannelAllocations(templateContent);
    expect(channels.length).toBe(3);
    expect(channels[0].pct).toBe(33);
  });
});

// ─── extractTopExperiments ──────────────────────────────────

describe("extractTopExperiments", () => {
  it("parses experiment backlog table", () => {
    const exps = extractTopExperiments(STRATEGY_CONTENT, 5);
    expect(exps.length).toBe(5);
    // Sorted by ICE descending
    expect(exps[0].ice).toBeGreaterThanOrEqual(exps[1].ice);
  });

  it("respects limit parameter", () => {
    const exps = extractTopExperiments(STRATEGY_CONTENT, 3);
    expect(exps.length).toBe(3);
  });

  it("returns empty for content without experiment backlog", () => {
    const exps = extractTopExperiments("# Just a title", 5);
    expect(exps).toEqual([]);
  });
});

// ─── validateDecompositionOutput ────────────────────────────

describe("validateDecompositionOutput", () => {
  const validTask = {
    title: "Write first draft of SEO article",
    description: "Research and write 1500 words on project management",
    duration_minutes: 90,
    priority: 1,
    executor_type: "claude_api",
    strategy_section_ref: "Channels.ContentSEO",
    experiment_id: "exp-1",
    recommended_assignee_role: null,
  };

  it("accepts valid JSON array", () => {
    const input = JSON.stringify([validTask, { ...validTask, title: "Review analytics dashboard", priority: 2, duration_minutes: 20 }]);
    // Saturday bounds (min: 1, max: 2) — testing JSON parsing, not day bounds
    const result = validateDecompositionOutput(input, "bootstrap", 1, 6);
    expect(result.valid).toBe(true);
    expect(result.tasks.length).toBe(2);
  });

  it("strips code fences before parsing", () => {
    const input = "```json\n" + JSON.stringify([validTask]) + "\n```";
    // Saturday bounds (min: 1, max: 2) — testing code-fence stripping, not day bounds
    const result = validateDecompositionOutput(input, "growth", 2, 6);
    expect(result.valid).toBe(true);
  });

  it("rejects non-JSON output", () => {
    const result = validateDecompositionOutput("not json", "bootstrap", 1, 2);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("not valid JSON");
  });

  it("rejects too many tasks", () => {
    const tasks = Array.from({ length: 8 }, (_, i) => ({
      ...validTask,
      title: `Write task ${i + 1}`,
      duration_minutes: 15,
    }));
    const result = validateDecompositionOutput(JSON.stringify(tasks), "bootstrap", 1, 2);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Too many tasks"))).toBe(true);
  });

  it("rejects tasks without verb-first title", () => {
    const badTask = { ...validTask, title: "blog post about SEO" };
    const result = validateDecompositionOutput(JSON.stringify([badTask]), "growth", 2, 2);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("verb"))).toBe(true);
  });

  it("rejects duration > 180", () => {
    const badTask = { ...validTask, duration_minutes: 200 };
    const result = validateDecompositionOutput(JSON.stringify([badTask]), "growth", 2, 2);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("duration_minutes"))).toBe(true);
  });

  it("rejects total duration exceeding tier max", () => {
    // Bootstrap solo founder: max 2 hours = 120 min
    const tasks = [
      { ...validTask, title: "Write blog post draft", duration_minutes: 90 },
      { ...validTask, title: "Research keyword analysis", duration_minutes: 45 },
      { ...validTask, title: "Review analytics dashboard", duration_minutes: 20 },
    ];
    const result = validateDecompositionOutput(JSON.stringify(tasks), "bootstrap", 1, 2);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Total duration"))).toBe(true);
  });

  it("rejects invalid executor_type", () => {
    const badTask = { ...validTask, executor_type: "magic" };
    const result = validateDecompositionOutput(JSON.stringify([badTask]), "growth", 2, 2);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("executor_type"))).toBe(true);
  });

  it("rejects missing strategy_section_ref", () => {
    const badTask = { ...validTask, strategy_section_ref: "" };
    const result = validateDecompositionOutput(JSON.stringify([badTask]), "growth", 2, 2);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("strategy_section_ref"))).toBe(true);
  });

  it("handles null recommended_assignee_role gracefully", () => {
    const task = { ...validTask, recommended_assignee_role: null };
    const result = validateDecompositionOutput(JSON.stringify([task]), "growth", 2, 2);
    // Should not error on null role
    expect(result.errors.filter((e) => e.includes("recommended_assignee_role"))).toEqual([]);
  });
});

// ─── buildDecompositionCorrectionPrompt ─────────────────────

describe("buildDecompositionCorrectionPrompt", () => {
  it("includes errors in correction prompt", () => {
    const prompt = buildDecompositionCorrectionPrompt(
      '[ bad json ]',
      ["Missing title on task 1", "Duration exceeds 180 min"],
    );
    expect(prompt).toContain("Missing title on task 1");
    expect(prompt).toContain("Duration exceeds 180 min");
    expect(prompt).toContain("bad json");
  });
});
