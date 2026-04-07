# Framework Selection Matrix — Reference for Strategy Generator

> **Purpose**: When the strategy generator ([6A]) builds a strategy doc, it selects which marketing frameworks to apply based on the org's industry, budget tier, and growth stage. This document defines the selection logic that `packages/prompts/src/strategy-generator.ts` implements.

---

## Available Frameworks

### 1. Growth Matrix

**What it is**: A 2×2 matrix mapping growth levers (acquisition, activation, retention, revenue, referral) against effort levels. Helps prioritize which growth lever to pull first.

**Best for**: Teams that already have some traction and need to decide where to invest next.

**Output**: A prioritized list of growth levers with specific tactics for each.

**When to select**: Always included for Growth and Scale tiers. Included for Bootstrap only if industry has clear PLG motion (B2B SaaS, Dev Tools).

### 2. Bullseye Framework

**What it is**: A 3-ring target (inner/middle/outer) for ranking marketing channels by expected effectiveness. Forces teams to prioritize 3 channels from a universe of 19.

**Best for**: Early-stage teams choosing their initial channel mix. The core channel selection tool.

**Output**: 3 inner-ring channels (focus), 3 middle-ring (test next), remaining in outer ring.

**When to select**: Always included. This is the primary channel selection framework for all strategies.

### 3. GACCS (Goals, Audience, Channels, Content, Schedule)

**What it is**: The structural framework for the strategy document itself. Defines what sections exist and how they relate.

**Best for**: Every strategy doc. This is the output format, not optional.

**Output**: The 6-section strategy document structure (see `gaccs-brief-format.md`).

**When to select**: Always included. This is the document structure, not a selection choice.

### 4. AARRR (Pirate Metrics)

**What it is**: Acquisition → Activation → Retention → Revenue → Referral funnel. Maps metrics to each stage and identifies the weakest link.

**Best for**: SaaS and product-led businesses with a measurable user funnel.

**Output**: Per-stage metrics, current baseline (if available), target, and experiments to move each metric.

**When to select**: Included when industry has a digital product funnel (B2B SaaS, Dev Tools, Marketplace, Fintech with self-serve). Excluded for pure services or high-touch sales.

### 5. ICE Scoring

**What it is**: Impact × Confidence × Ease scoring for experiment prioritization. Simple, fast, actionable.

**Best for**: Prioritizing the experiment backlog in every strategy doc.

**Output**: Scored and ranked experiment backlog table.

**When to select**: Always included. Every strategy doc has an ICE-scored experiment backlog.

---

## Selection Matrix

The strategy generator selects frameworks based on this decision table. "✓" = included, "—" = excluded, "○" = included if Growth/Scale tier only.

| Framework | B2B SaaS | Dev Tools | DTC eCommerce | Fintech | Marketplace | Healthtech | Other |
|-----------|----------|-----------|---------------|---------|-------------|------------|-------|
| **Bullseye** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **GACCS** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **ICE** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **AARRR** | ✓ | ✓ | — | ✓ | ✓ | — | — |
| **Growth Matrix** | ○ | ○ | ○ | ○ | ○ | ○ | — |

### Selection Logic (pseudocode)

```typescript
function selectFrameworks(industry: Industry, budgetTier: BudgetTier): Framework[] {
  // Always included
  const frameworks: Framework[] = ["bullseye", "gaccs", "ice"];

  // AARRR: included for digital-product funnels
  const hasDigitalFunnel = ["b2b_saas", "dev_tools", "fintech", "marketplace"];
  if (hasDigitalFunnel.includes(industry)) {
    frameworks.push("aarrr");
  }

  // Growth Matrix: only for Growth/Scale tiers (Bootstrap is too early)
  const isGrowthOrScale = budgetTier !== "bootstrap";
  const hasPlgMotion = ["b2b_saas", "dev_tools", "marketplace", "fintech", "dtc_ecommerce", "healthtech"];
  if (isGrowthOrScale && hasPlgMotion.includes(industry)) {
    frameworks.push("growth_matrix");
  }

  return frameworks;
}
```

### "Other" Industry Selection Notes

For companies in an industry not explicitly listed above:
- **Selected frameworks**: Bullseye, GACCS, ICE (always). AARRR and Growth Matrix excluded until validated.
- **Strategy generator behavior**: Uses generic channel recommendations with heavy emphasis on customer discovery and validation.
- **Output disclaimer**: The generated strategy must include this notice at the top:
  > "This strategy uses generic industry assumptions. Validate channel recommendations against your specific market before executing. Run customer discovery interviews with 5–10 prospects before committing budget to any channel."

---

## Hybrid Industry Guidance

If a company spans two industries (e.g., B2B SaaS with marketplace component, or healthtech platform with DTC consumer app):

1. **Select the industry that best describes the PRIMARY revenue model** — Use the selection matrix to pick frameworks
2. **Apply industry-specific modifiers from the secondary industry** — Add relevant prompt constraints from the secondary industry row in "Industry-Specific Prompt Modifiers"
3. **Document in the strategy output** — Include a note: "Primary model: [X], secondary characteristics: [Y]. Channel recommendations are weighted toward [X]; validate fit of [Y] characteristics."

**Example**: A telemedicine platform with B2B partnerships + DTC consumer sales.
- Primary: Fintech (health payment processing) → select Bullseye, GACCS, ICE, AARRR
- Secondary: DTC eCommerce → add "Revenue-per-visit focus" modifier to prompt
- Output note: "Primary model: B2B payments platform, secondary characteristics: consumer patient acquisition. Channel recommendations weighted toward B2B partnerships; validate consumer CAC assumptions."

---

## Framework Interaction Rules

When multiple frameworks are selected, they interact as follows:

1. **Bullseye → GACCS Channels**: Bullseye's inner-ring channels become the 3 channels in the GACCS Channels section.
2. **AARRR → GACCS Goals**: If AARRR is selected, the Goals section includes at least one metric per funnel stage (Acquisition, Activation, Retention, Revenue, Referral).
3. **Growth Matrix → GACCS Schedule**: If Growth Matrix is selected, the Schedule phases align with the prioritized growth levers (e.g., Phase 1 = Acquisition, Phase 2 = Activation).
4. **ICE → Experiment Backlog**: ICE scoring is applied to every experiment. Experiments from all frameworks feed into a single, unified backlog.
5. **CAC Benchmarks → Bullseye**: Channel CAC data from `industry-cac-benchmarks.md` informs the Bullseye ranking. Channels with CAC above budget tier threshold are pushed to the outer ring.

---

## Industry-Specific Prompt Modifiers

Beyond framework selection, the strategy generator applies industry-specific prompt context:

| Industry | Key Modifier | Effect on Output |
|----------|-------------|-----------------|
| B2B SaaS | PLG emphasis | Channels include product-led growth; experiments include viral loops, freemium optimization |
| Dev Tools | Trust-first | Documentation as a marketing channel; community before content; anti-marketing tone |
| DTC eCommerce | Revenue-per-visit focus | Email/SMS emphasis; conversion optimization; AOV experiments |
| Fintech | Compliance-aware | All content recommendations flagged for regulatory review; conservative claims. **Compliance gate**: All ROI claims, pricing comparisons, and regulatory content require documented substantiation before publishing (FTC enforcement precedent: $33M Biz2Credit, 2024) |
| Marketplace | Two-sided | Separate supply/demand strategies; cold-start experiments; liquidity metrics |
| Healthtech | Evidence-based | Clinical validation emphasis; pilot programs as a channel; HIPAA-aware content. **Compliance gate**: Case studies require HIPAA-compliant de-identification. Clinical claims require medical advisor review. Content timelines must include 5–8 business day compliance review buffer. |

---

## PMF Velocity Override

If an org demonstrates faster-than-typical growth, graduate framework selection early:

- **Signal**: >15% weekly signup growth AND >$500 MRR while classified in Bootstrap tier
- **Action**: Apply Growth tier framework selection immediately. Add Growth Matrix to selected frameworks and expand Bullseye to 5 channels (instead of 3 inner ring).
- **Rationale**: Budget tier is a proxy for growth stage. Actual growth rate is a better signal of market fit maturity. An organization with strong PMF should have access to frameworks designed for accelerating growth, regardless of current spend.
- **Example**: A B2B SaaS bootstrap company showing 20% weekly growth and $2k MRR should receive Bullseye (5 channels), GACCS, ICE, AARRR, and Growth Matrix — same as a Growth tier company.

---

## How This Connects to Other Systems

- **Strategy Generator ([6A])**: `strategy-generator.ts` calls `selectFrameworks()` and uses the matrix to construct the prompt
- **Framework Libraries ([6A])**: Each framework has its own file in `packages/prompts/src/frameworks/` encoding its methodology as prompt components
- **Onboarding ([2C])**: The bootstrap templates are pre-generated for the 3 most common industry × Bootstrap combinations. The selection matrix explains why those 3 were chosen.
- **Template selection ([2C])**: `industry-selector.tsx` maps the selected industry to the correct bootstrap template using the same industry key
