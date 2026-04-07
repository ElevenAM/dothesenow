# Strategy Generator Framework Notes — Reference for Phase [6A]

> **Purpose**: Detailed encoding of each marketing framework that `packages/prompts/src/frameworks/` will implement. Each section documents the framework methodology, how it translates into prompt instructions, and what structured output the LLM should produce.
>
> When implementing [6A], create one file per framework in `packages/prompts/src/frameworks/`. Each file exports a function that returns prompt fragments to inject into the strategy generation prompt.

---

## 1. Bullseye Framework

**Source**: Gabriel Weinberg & Justin Mares, *Traction*

### Methodology
1. **Brainstorm**: List all 19 traction channels (see full list below)
2. **Rank**: For each channel, estimate potential reach, cost, and fit for your audience
3. **Prioritize into rings**:
   - **Inner ring** (3 channels): Highest expected ROI. These are your focus.
   - **Middle ring** (3 channels): Promising but unproven. Test next quarter.
   - **Outer ring** (remaining): Low priority or poor fit. Revisit later.

### The 19 Traction Channels
1. Viral Marketing
2. PR / Press
3. Unconventional PR
4. Search Engine Marketing (SEM)
5. Social & Display Ads
6. Offline Ads
7. Search Engine Optimization (SEO)
8. Content Marketing
9. Email Marketing
10. Engineering as Marketing (tools, calculators)
11. Targeting Blogs
12. Business Development / Partnerships
13. Sales
14. Affiliate Programs
15. Existing Platforms (marketplaces, app stores)
16. Trade Shows / Conferences
17. Offline Events / Meetups
18. Speaking Engagements
19. Community Building

### Prompt Fragment Structure
```
Rank 19 traction channels for {industry} at {budget_tier}: Inner Ring (top 3 by fit + CAC + speed), Middle Ring (next 3), Outer Ring (rest). For each Inner ring: rationale, CAC range from {cac_source}, weeks to first result, validation experiment. If bootstrap: exclude channels >$500/mo.
```

### Output Schema
```typescript
interface BullseyeOutput {
  innerRing: ChannelRanking[];  // exactly 3
  middleRing: ChannelRanking[];  // exactly 3
  outerRing: ChannelRanking[];   // remaining 13
}

interface ChannelRanking {
  channel: string;
  rationale: string;
  estimatedCac: { low: number; high: number; median: number };
  timeToResults: string;  // e.g., "2–4 weeks", "3–6 months"
  validationExperiment: string;
}
```

---

## 2. Growth Matrix

**Source**: Adapted from Brian Balfour's growth framework

### Methodology
Map 5 growth levers against effort required to identify the highest-leverage, lowest-effort opportunity:

| Lever | Description | Key Metrics |
|-------|-------------|-------------|
| **Acquisition** | Getting new users into the funnel | Visitors, signups, CAC |
| **Activation** | New users reaching the "aha moment" | Time-to-value, activation rate |
| **Retention** | Users coming back | DAU/MAU, churn rate, cohort curves |
| **Revenue** | Users paying (or paying more) | Conversion rate, ARPU, LTV |
| **Referral** | Users bringing other users | Viral coefficient, referral rate |

For each lever, rate:
- **Current performance** (1–10): How well is this working today?
- **Improvement potential** (1–10): How much room to grow?
- **Effort required** (1–10, inverted: 10 = easy): How hard is it to improve?

**Priority score** = Improvement potential × Effort (inverted)

### Prompt Fragment Structure
```
For a {industry} company at {budget_tier} stage, analyze these 5 growth levers:

For each lever (Acquisition, Activation, Retention, Revenue, Referral):
1. Assess likely current performance for a typical {industry} company at this stage
2. Estimate improvement potential
3. Estimate effort required
4. Calculate priority score (Improvement potential × Effort inverted)
5. Recommend 2–3 specific tactics

Rank levers by priority score. The top 2 levers should map to Phase 1–2 of the GACCS Schedule.
```

### Attribution Model (Growth/Scale tiers only)

For Growth and Scale tiers, the GACCS Channels section must include an attribution model:

- **Bootstrap**: No attribution needed (too few data points; use qualitative judgment)
- **Growth**: Position-based attribution (40% first-touch, 20% linear, 40% last-touch)
- **Scale**: Data-driven attribution (requires ~400 conversions/month minimum for statistical significance)

Include in generated strategy: "Do not cut a channel based solely on last-touch conversion. If Content shows low direct CAC but high view-through, it's driving awareness that other channels convert."

### Output Schema
```typescript
interface GrowthMatrixOutput {
  levers: GrowthLever[];  // sorted by priorityScore descending
  topTwoFocus: [string, string];  // mapped to Schedule phases
}

interface GrowthLever {
  name: "acquisition" | "activation" | "retention" | "revenue" | "referral";
  currentPerformance: number;
  improvementPotential: number;
  effortRequired: number;
  priorityScore: number;
  tactics: string[];  // 2–3 specific tactics
}
```

---

## 3. GACCS (Goals, Audience, Channels, Content, Schedule)

**See**: `gaccs-brief-format.md` for the full specification.

This is the **output format**, not a selection-based framework. The strategy generator always produces a GACCS-structured document. The other frameworks (Bullseye, Growth Matrix, AARRR) feed INTO the GACCS sections:

| GACCS Section | Fed by Framework |
|---------------|-----------------|
| Goals | AARRR (metrics per funnel stage) |
| Audience | Org profile (industry, stage) |
| Channels | Bullseye (inner ring → 3 channels) |
| Content | Derived from channels + audience |
| Schedule | Growth Matrix (top levers → phase themes) |
| Experiment Backlog | ICE scoring (all experiments unified) |

### Prompt Fragment
```
Structure your output as a GACCS strategy brief with these exact sections:
1. Goals (3–5, specific, measurable)
2. Audience (Primary, Secondary, Pain points, Watering holes)
3. Channels (top 3 from Bullseye inner ring, with type/metric/budget %)
4. Content (Pillars, Cadence, Formats)
5. Schedule (3 phases × 2 months, each with Theme/Actions/Success criteria/Decision point)
6. Experiment Backlog (8+ experiments, ICE scored, sorted descending)
```

---

## 4. AARRR (Pirate Metrics)

**Source**: Dave McClure

### Methodology
Define and measure each funnel stage:

| Stage | Question | Example Metrics |
|-------|----------|----------------|
| **Acquisition** | How do users find us? | Unique visitors, signup rate, channel attribution |
| **Activation** | Do they have a good first experience? | Completed onboarding %, first task created, time-to-value |
| **Retention** | Do they come back? | D7/D30 retention, weekly active rate, churn |
| **Revenue** | Do they pay? | Trial→paid conversion, ARPU, MRR |
| **Referral** | Do they tell others? | Referral invites sent, viral coefficient, NPS |

### Industry-Specific Funnel Definitions

| Industry | Activation Metric | Retention Metric | Revenue Metric |
|----------|------------------|------------------|----------------|
| B2B SaaS | First workflow created | Weekly login | Trial → paid conversion |
| Dev Tools | First API call or integration | Weekly API calls | Free → paid tier upgrade |
| Fintech | First transaction or connection | Monthly transaction | Account balance or transaction volume |
| Marketplace | First listing (supply) / first purchase (demand) | Monthly transactions | GMV, take rate |

### Prompt Fragment Structure
```
For a {industry} company, define the AARRR funnel:

For each stage (Acquisition, Activation, Retention, Revenue, Referral):
1. Primary metric for this industry
2. Realistic baseline for a {budget_tier}-stage company
3. 6-month target
4. Top experiment to move this metric

Map the weakest funnel stage to Phase 1 of the GACCS Schedule.
Include at least one metric per stage in the Goals section.
```

### Output Schema
```typescript
interface AARRROutput {
  stages: FunnelStage[];
  weakestStage: string;  // maps to Phase 1 focus
}

interface FunnelStage {
  name: "acquisition" | "activation" | "retention" | "revenue" | "referral";
  primaryMetric: string;
  baseline: string;
  sixMonthTarget: string;
  topExperiment: string;
}
```

---

## 5. ICE Scoring

**Source**: Sean Ellis

### Methodology
For each experiment in the backlog:
- **Impact** (1–10): If this works, how much will it move the needle?
- **Confidence** (1–10): How sure are we it will work? (Based on evidence, benchmarks, past experience)
- **Ease** (1–10): How easy is it to implement? (Time, cost, complexity)

**ICE Score** = Impact × Confidence × Ease (each 1–10, range 1–1000). This is the industry standard per Sean Ellis. Multiplication ensures a low score in any dimension dramatically reduces priority, preventing teams from pursuing imbalanced experiments (e.g., a high-impact idea with low confidence or high difficulty shouldn't rank above balanced, achievable bets).

### Scoring Calibration Guide

To ensure consistent scoring across industries, use these anchors:

**Impact anchors** (how much does this move the primary metric):
- 10: Could 2x our primary metric
- 7–8: Significant, measurable improvement (20–50% lift)
- 4–6: Moderate improvement (5–20% lift)
- 1–3: Marginal or uncertain improvement

**Confidence anchors** (how sure are we this will work):
- 10: Proven tactic, industry standard, we've done it before
- 7–8: Strong evidence from benchmarks or case studies
- 4–6: Reasonable hypothesis, some supporting data
- 1–3: Unproven, experimental, gut feel

**Ease anchors** (how hard is it to execute):
- 10: Can do this afternoon, no dependencies
- 7–8: A few days of work, minimal dependencies
- 4–6: A week+ of work, some coordination needed
- 1–3: Major effort, multiple dependencies, specialized skills

**Example**: Email nurture sequence for B2B SaaS: Impact 8 (can improve activation rate 30%), Confidence 9 (proven tactic), Ease 8 (few days to write + set up automation). **ICE = 8 × 9 × 8 = 576**.

---

## Primary Metrics by Industry (for ICE Calibration)

When scoring Impact, use these primary metrics to anchor "2x" and "50% lift":

| Industry | Primary Metric | "2x" Means | "50% Lift" Means |
|----------|---------------|-----------|-----------------|
| B2B SaaS | Monthly signups | 20→40 signups/mo | 20→30 signups/mo |
| Dev Tools | Weekly active developers | 50→100 WAD | 50→75 WAD |
| DTC eCommerce | Monthly orders | 100→200 orders/mo | 100→150 orders/mo |
| Fintech | Monthly active users | 200→400 MAU | 200→300 MAU |
| Marketplace | Monthly transactions | 50→100 txns/mo | 50→75 txns/mo |
| Healthtech | Active pilot practices | 3→6 practices | 3→5 practices |

---

### Prompt Fragment Structure
```
Score each experiment using ICE (Impact × Confidence × Ease, each 1–10, range 1–1000).

Calibration (use primary metric for industry):
- Impact: 10 = 2x primary metric, 5 = moderate lift, 1 = marginal
- Confidence: 10 = proven tactic, 5 = reasonable hypothesis, 1 = gut feel
- Ease: 10 = same-day execution, 5 = one week of work, 1 = major effort

Budget constraint: For bootstrap tier, apply Ease multiplier of 0.5x for any experiment requiring paid spend >$200/month (this drastically reduces score).

Sort experiments by ICE score descending (highest first). Minimum 8 experiments.
```

---

## Prompt Assembly Order

When the strategy generator constructs the full prompt, frameworks are assembled in this order:

**Before step 1, gather additional org context**:
- "Who are your top 3 current customers and why did they buy?"
- "Who is your primary competitor, and how are you different?"
- "What's your unfair advantage (technical, network, domain expertise)?"

Inject as constraint: "Ensure recommended channels and content leverage [unfair advantage]. Generic advice applicable to any {industry} company is a failing."

---

1. **System prompt**: Role (marketing strategist), output format (GACCS), constraints
2. **Org context**: Industry, budget tier, stage, growth motion, timezone, unfair advantage, competitor differentiation
3. **Bullseye analysis**: Channel ranking prompt → feeds Channels section
4. **AARRR analysis** (if selected): Funnel definition → feeds Goals section
5. **Growth Matrix** (if selected): Lever prioritization → feeds Schedule section
6. **GACCS structure**: Assemble all sections into final document
7. **ICE scoring**: Score experiment backlog → feeds final section
8. **Validation instructions**: Remind LLM of all validation rules from `gaccs-brief-format.md`

---

## How This Connects to Other Systems

- **Framework files ([6A])**: Each section above maps to a file in `packages/prompts/src/frameworks/`
- **Strategy Generator ([6A])**: `strategy-generator.ts` orchestrates framework selection and prompt assembly
- **CAC Benchmarks**: Referenced by Bullseye prompt for realistic channel costing
- **Selection Matrix**: `framework-selection-matrix.md` determines which frameworks are included
- **Task Decomposer ([6B])**: Consumes the GACCS output, especially Schedule and Experiment Backlog
