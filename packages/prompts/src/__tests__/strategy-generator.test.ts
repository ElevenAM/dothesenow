import { describe, it, expect } from "vitest";
import {
  assembleStrategyPrompt,
  validateGaccsOutput,
  buildCorrectionPrompt,
} from "../strategy-generator.js";
import type { OrgProfile } from "../types.js";

const B2B_BOOTSTRAP: OrgProfile = {
  industry: "b2b_saas",
  budgetTier: "bootstrap",
  stage: "early",
  growthMotion: "product_led",
  name: "TestCo",
};

const FINTECH_GROWTH: OrgProfile = {
  industry: "fintech",
  budgetTier: "growth",
  stage: "growth",
  growthMotion: "sales_led",
  name: "FinCo",
};

const HEALTHTECH_BOOTSTRAP: OrgProfile = {
  industry: "healthtech",
  budgetTier: "bootstrap",
  stage: "early",
  growthMotion: null,
  name: "HealthCo",
};

const OTHER_BOOTSTRAP: OrgProfile = {
  industry: "other",
  budgetTier: "bootstrap",
  stage: null,
  growthMotion: null,
  name: "OtherCo",
};

// ─── assembleStrategyPrompt ───────────────────────────────────

describe("assembleStrategyPrompt", () => {
  it("returns systemPrompt and userPrompt strings", () => {
    const { systemPrompt, userPrompt } = assembleStrategyPrompt(
      B2B_BOOTSTRAP,
      ["bullseye", "gaccs", "ice", "aarrr"],
    );
    expect(typeof systemPrompt).toBe("string");
    expect(typeof userPrompt).toBe("string");
    expect(systemPrompt.length).toBeGreaterThan(100);
    expect(userPrompt.length).toBeGreaterThan(100);
  });

  it("system prompt contains role definition", () => {
    const { systemPrompt } = assembleStrategyPrompt(B2B_BOOTSTRAP, [
      "bullseye",
      "gaccs",
      "ice",
    ]);
    expect(systemPrompt).toContain("senior marketing strategist");
    expect(systemPrompt).toContain("GACCS");
  });

  it("user prompt contains org context", () => {
    const { userPrompt } = assembleStrategyPrompt(B2B_BOOTSTRAP, [
      "bullseye",
      "gaccs",
      "ice",
    ]);
    expect(userPrompt).toContain("TestCo");
    expect(userPrompt).toContain("b2b saas");
    expect(userPrompt).toContain("bootstrap");
  });

  it("includes Bullseye content when selected", () => {
    const { userPrompt } = assembleStrategyPrompt(B2B_BOOTSTRAP, [
      "bullseye",
      "gaccs",
      "ice",
    ]);
    expect(userPrompt).toContain("Bullseye");
    expect(userPrompt).toContain("Inner Ring");
    expect(userPrompt).toContain("traction channels");
  });

  it("includes AARRR content when selected", () => {
    const { userPrompt } = assembleStrategyPrompt(B2B_BOOTSTRAP, [
      "bullseye",
      "gaccs",
      "ice",
      "aarrr",
    ]);
    expect(userPrompt).toContain("AARRR");
    expect(userPrompt).toContain("Acquisition");
    expect(userPrompt).toContain("Retention");
  });

  it("excludes AARRR content when not selected", () => {
    const { userPrompt } = assembleStrategyPrompt(
      { ...B2B_BOOTSTRAP, industry: "dtc_ecommerce" },
      ["bullseye", "gaccs", "ice"],
    );
    expect(userPrompt).not.toContain("AARRR Pirate Metrics");
  });

  it("includes Growth Matrix when selected", () => {
    const { userPrompt } = assembleStrategyPrompt(FINTECH_GROWTH, [
      "bullseye",
      "gaccs",
      "ice",
      "aarrr",
      "growth_matrix",
    ]);
    expect(userPrompt).toContain("Growth Matrix");
    expect(userPrompt).toContain("priority score");
  });

  it("bootstrap prompts enforce max 3 channels", () => {
    const { userPrompt } = assembleStrategyPrompt(B2B_BOOTSTRAP, [
      "bullseye",
      "gaccs",
      "ice",
    ]);
    expect(userPrompt).toContain("3 channels");
    expect(userPrompt).toMatch(/maximum\s+3/i);
  });

  it("fintech prompts include compliance gate", () => {
    const { systemPrompt } = assembleStrategyPrompt(FINTECH_GROWTH, [
      "bullseye",
      "gaccs",
      "ice",
    ]);
    expect(systemPrompt).toContain("COMPLIANCE GATE");
    expect(systemPrompt).toContain("substantiation");
  });

  it("healthtech prompts include HIPAA notice", () => {
    const { systemPrompt } = assembleStrategyPrompt(
      HEALTHTECH_BOOTSTRAP,
      ["bullseye", "gaccs", "ice"],
    );
    expect(systemPrompt).toContain("HIPAA");
  });

  it("'other' industry includes disclaimer", () => {
    const { userPrompt } = assembleStrategyPrompt(OTHER_BOOTSTRAP, [
      "bullseye",
      "gaccs",
      "ice",
    ]);
    expect(userPrompt).toContain("generic industry assumptions");
  });

  it("includes validation reminders", () => {
    const { userPrompt } = assembleStrategyPrompt(B2B_BOOTSTRAP, [
      "bullseye",
      "gaccs",
      "ice",
    ]);
    expect(userPrompt).toContain("Final Validation Checklist");
    expect(userPrompt).toContain("Experiment Backlog");
  });

  it("includes ICE scoring calibration", () => {
    const { userPrompt } = assembleStrategyPrompt(B2B_BOOTSTRAP, [
      "bullseye",
      "gaccs",
      "ice",
    ]);
    expect(userPrompt).toContain("ICE Score");
    expect(userPrompt).toContain("1–1,000");
  });
});

// ─── validateGaccsOutput ──────────────────────────────────────

const VALID_GACCS = `# Test Strategy

## Goals
- Acquire 200 signups in 6 months
- Achieve $5K MRR by month 6
- Build an email list of 1,000 subscribers

## Audience
- **Primary**: Engineering managers at startups
- **Secondary**: CTOs at bootstrapped companies
- **Pain points**: Manual reporting, no visibility, context-switching
- **Watering holes**: Hacker News, LinkedIn, Lenny's Newsletter

## Channels
1. **Content/SEO** (owned) — Audience searches for workflow problems. Primary metric: organic signups/month. Budget: 50%.
2. **LinkedIn** (owned) — Decision-makers active daily. Primary metric: profile views. Budget: 20%.
3. **Email/Newsletter** (owned) — Nurture blog visitors. Primary metric: list growth. Budget: 30%.

## Content
### Pillars
- Workflow automation guides
- Product comparison guides
- Founder insights

### Cadence
- Blog: 2 posts/week
- LinkedIn: 3 posts/week
- Email: 1 newsletter/week

### Formats
- Long-form blog (1,500 words)
- LinkedIn text posts
- Email newsletter

## Schedule

### Months 1–2: Foundation
- **Theme**: Establish content engine
- **Actions**: Publish 8 articles, set up LinkedIn, launch email capture
- **Success criteria**: 500 organic visits, 50 subscribers
- **Decision point**: Which topics drive most engagement?

### Months 3–4: Amplification
- **Theme**: Double down on what works
- **Actions**: Increase posting, launch email drip, first case study
- **Success criteria**: 2,000 visits, 200 subscribers, 20 trials
- **Decision point**: Is organic enough?

### Months 5–6: Optimization
- **Theme**: Refine conversion
- **Actions**: A/B test CTAs, referral program, evaluate paid channel
- **Success criteria**: 50 signups/month
- **Decision point**: What goes into next strategy?

## Experiment Backlog

| Experiment | Impact | Confidence | Ease | ICE Score |
|------------|--------|------------|------|-----------|
| SEO content cluster | 8 | 9 | 7 | 504 |
| LinkedIn founder series | 7 | 8 | 8 | 448 |
| Email welcome sequence | 8 | 9 | 8 | 576 |
| Guest blogging | 6 | 7 | 6 | 252 |
| Webinar series | 7 | 6 | 5 | 210 |
| Referral program | 8 | 6 | 4 | 192 |
| Product Hunt launch | 9 | 5 | 4 | 180 |
| Cold outreach campaign | 6 | 5 | 5 | 150 |
`;

describe("validateGaccsOutput", () => {
  it("valid GACCS doc passes validation", () => {
    const result = validateGaccsOutput(VALID_GACCS, "bootstrap");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects missing Goals section", () => {
    const noGoals = VALID_GACCS.replace("## Goals", "## Objectives");
    const result = validateGaccsOutput(noGoals, "bootstrap");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required section: "Goals"');
  });

  it("detects missing Experiment Backlog section", () => {
    const noBacklog = VALID_GACCS.replace(
      "## Experiment Backlog",
      "## Experiments",
    );
    const result = validateGaccsOutput(noBacklog, "bootstrap");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Missing required section: "Experiment Backlog"',
    );
  });

  it("detects fewer than 3 goals", () => {
    const fewGoals = VALID_GACCS.replace(
      `## Goals
- Acquire 200 signups in 6 months
- Achieve $5K MRR by month 6
- Build an email list of 1,000 subscribers`,
      `## Goals
- Acquire 200 signups
- Achieve $5K MRR`,
    );
    const result = validateGaccsOutput(fewGoals, "bootstrap");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Goals") && e.includes("2"))).toBe(true);
  });

  it("detects missing schedule phases", () => {
    const onePhase = VALID_GACCS.replace(
      /### Months 3–4[\s\S]*?### Months 5–6/,
      "### Months 5–6",
    );
    const result = validateGaccsOutput(onePhase, "bootstrap");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Schedule") && e.includes("phases"))).toBe(true);
  });

  it("detects too few experiments", () => {
    const fewExperiments = VALID_GACCS.replace(
      /\| Guest blogging[\s\S]*?\| Cold outreach campaign \| 6 \| 5 \| 5 \| 150 \|/,
      "",
    );
    const result = validateGaccsOutput(fewExperiments, "bootstrap");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Experiment Backlog"))).toBe(true);
  });
});

// ─── buildCorrectionPrompt ────────────────────────────────────

describe("buildCorrectionPrompt", () => {
  it("includes all errors in correction prompt", () => {
    const errors = ['Missing required section: "Goals"', "Schedule: found 2 phases, need exactly 3"];
    const prompt = buildCorrectionPrompt("some content", errors);
    expect(prompt).toContain('Missing required section: "Goals"');
    expect(prompt).toContain("found 2 phases");
    expect(prompt).toContain("some content");
  });
});
