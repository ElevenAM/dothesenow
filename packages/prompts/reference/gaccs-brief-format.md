# GACCS Brief Format — Reference for Strategy Generator

> **Purpose**: This document defines the exact output structure that the LLM strategy generator ([6A]) must produce. Every generated strategy doc follows this format. The onboarding bootstrap templates (Phase [2C]) loosely follow it; the LLM generator must follow it exactly.

---

## What Is GACCS?

GACCS is a strategic marketing brief framework: **Goals, Audience, Channels, Content, Schedule**. It provides a complete, actionable marketing strategy in a single document that an AI task decomposer can later break into daily actions.

---

## Strict Markdown Schema

Every LLM output MUST follow this exact markdown structure. This schema prevents parsing fragility and ensures all systems (task decomposer, strategy refiner) can reliably parse the output.

```markdown
# [Strategy Title]

## Goals
- [Goal 1]
- [Goal 2]
- [Goal 3]

## Audience
- **Primary**: [Description]
- **Secondary**: [Description]
- **Pain points**: [Point 1], [Point 2], [Point 3]
- **Watering holes**: [Location 1], [Location 2], [Location 3]

## Channels
1. **[Channel Name]** ([Type]) — [Rationale]. Primary metric: [Metric]. Budget: [X]%.
2. **[Channel Name]** ([Type]) — [Rationale]. Primary metric: [Metric]. Budget: [X]%.
3. **[Channel Name]** ([Type]) — [Rationale]. Primary metric: [Metric]. Budget: [X]%.

## Content
### Pillars
- [Pillar 1]
- [Pillar 2]
- [Pillar 3]

### Cadence
- [Channel 1]: [Frequency]
- [Channel 2]: [Frequency]
- [Channel 3]: [Frequency]

### Formats
- [Format 1]: [Description]
- [Format 2]: [Description]
- [Format 3]: [Description]

## Schedule

### Months 1–2: [Theme]
- **Theme**: [1-line summary]
- **Actions**: [Action 1], [Action 2], [Action 3]
- **Success criteria**: [Criteria 1], [Criteria 2]
- **Decision point**: [Key question]

### Months 3–4: [Theme]
- **Theme**: [1-line summary]
- **Actions**: [Action 1], [Action 2], [Action 3]
- **Success criteria**: [Criteria 1], [Criteria 2]
- **Decision point**: [Key question]

### Months 5–6: [Theme]
- **Theme**: [1-line summary]
- **Actions**: [Action 1], [Action 2], [Action 3]
- **Success criteria**: [Criteria 1], [Criteria 2]
- **Decision point**: [Key question]

## Experiment Backlog

| Experiment | Impact | Confidence | Ease | ICE Score |
|------------|--------|------------|------|-----------|
| [Description] | [1-10] | [1-10] | [1-10] | [Score] |
```

---

## Required Sections

Every generated strategy document MUST contain these sections in this order. The LLM output is validated against this schema in snapshot tests.

### 1. Goals (3–5 bullet points)

Each goal must be:
- **Specific** — tied to a measurable outcome (users, revenue, signups, pipeline)
- **Time-bounded** — implicitly scoped to the 6-month strategy horizon
- **Prioritized** — listed in order of importance

Example:
```
## Goals
- Acquire 200 qualified signups in 6 months through organic channels
- Achieve $5K MRR by month 6 through conversion optimization
- Build an email list of 1,000 subscribers for nurture campaigns
```

### 2. Audience (structured, not freeform)

Required subfields:
- **Primary**: Who they are, company size/type, role
- **Secondary**: Adjacent audience worth reaching
- **Pain points**: 3–5 specific frustrations the product solves
- **Watering holes**: 2–3 locations where this audience spends time online (used by channel selection)

Example:
```
## Audience
- **Primary**: Engineering managers at Series A–B startups (20–100 employees)
- **Secondary**: CTOs at bootstrapped companies evaluating tooling
- **Pain points**: Manual sprint reporting, no visibility into team velocity, context-switching between tools
- **Watering holes**: Hacker News, r/ExperiencedDevs, LinkedIn, Lenny's Newsletter
```

### 3. Channels (ranked, max 3 for bootstrap)

Each channel entry MUST include:
- **Channel name** and type (owned, earned, paid)
- **Why this channel** — 1-sentence rationale tied to audience watering holes
- **Primary metric** (required) — Example: "organic signups/month", "qualified leads", "conversion rate from email click"
- **Budget allocation %** (required) — Numeric percentage; all channels must sum to 100%

Bootstrap constraint: Max 3 channels. Growth and Scale tiers can add more.

Example:
```
## Channels
1. **Content/SEO** (owned) — Audience searches for workflow problems; long-tail SEO captures intent. Primary metric: organic signups/month. Budget: 50%.
2. **LinkedIn** (owned) — Decision-makers are active daily; founder content builds trust. Primary metric: profile views → site visits. Budget: 20%.
3. **Email/Newsletter** (owned) — Nurture blog visitors into trial users. Primary metric: list growth rate + trial conversion. Budget: 30%.
```

### 4. Content (pillars + cadence)

Required subfields (all mandatory):
- **Content Pillars**: 3–4 thematic categories all content maps to
- **Cadence**: Weekly publishing schedule by channel (required subsection)
- **Formats**: What types of content (blog posts, videos, threads, etc.) (required subsection)

Example:
```
## Content
### Pillars
- Workflow automation guides (problem-aware SEO)
- Product comparison and migration guides (solution-aware SEO)
- Founder insights and build-in-public updates (trust building)

### Cadence
- Blog: 2 posts/week (1 SEO, 1 thought leadership)
- LinkedIn: 3 posts/week (Mon/Wed/Fri)
- Email: 1 newsletter/week (Thursday)

### Formats
- Long-form blog (1,500–2,500 words for SEO)
- LinkedIn text posts (150–300 words, personal tone)
- Email newsletter (curated insights + 1 CTA)
```

### 5. Schedule (6-month phased roadmap)

Required structure: 3 phases of 2 months each. Each phase MUST include:
- **Theme** — 1-line summary (required)
- **Actions** — 3–5 specific deliverables (required)
- **Success criteria** — how to know the phase worked (required)
- **Decision point** — what to evaluate before moving to next phase (required)

Example:
```
## Schedule

### Months 1–2: Foundation
- **Theme**: Establish content engine and baseline metrics
- **Actions**: Publish 8 SEO articles, set up LinkedIn cadence, launch email capture
- **Success criteria**: 500 organic visits/month, 50 email subscribers
- **Decision point**: Which content topics drive the most engagement?

### Months 3–4: Amplification
- **Theme**: Double down on what's working, start nurture
- **Actions**: Increase posting on top topics, launch email drip, first case study
- **Success criteria**: 2,000 organic visits/month, 200 email subscribers, 20 trials
- **Decision point**: Is organic enough, or do we need paid?

### Months 5–6: Optimization
- **Theme**: Refine conversion, test expansion channels
- **Actions**: A/B test CTAs, referral program, evaluate one paid channel
- **Success criteria**: 50 signups/month, clear #1 channel identified
- **Decision point**: What goes into the next 6-month strategy?
```

### 6. Experiment Backlog (ICE Scored)

Required: Minimum 8 experiments. Each row:
- **Experiment**: Specific, actionable description (not vague)
- **Impact** (1–10): How much will this move the needle if it works?
- **Confidence** (1–10): How sure are we it will work?
- **Ease** (1–10): How easy is it to execute?
- **ICE Score**: Impact × Confidence × Ease (range: 1–1,000)

Sorted by ICE Score descending. The task decomposer pulls from this backlog.

---

## Validation Rules (for snapshot tests)

The strategy generator output is parsed and validated against these rules:

1. **All 6 sections present** (Goals, Audience, Channels, Content, Schedule, Experiment Backlog)
2. **Goals**: 3–5 items, each measurable with numeric targets
3. **Audience**: has Primary, Secondary, Pain points (3–5), **Watering holes** (2–3 locations)
4. **Channels**:
   - Exactly 3 for Bootstrap tier, up to 5 for Growth/Scale
   - Each channel has: name, type, rationale, Primary metric (required), Budget % (required)
   - Budget allocations sum to exactly 100%
5. **Content**: has Pillars (3–4), Cadence (required subsection), Formats (required subsection)
6. **Schedule**: exactly 3 phases, each with Theme, Actions (3–5), Success criteria, Decision point (all required)
7. **Experiment Backlog**:
   - Minimum 8 rows
   - ICE Score = Impact × Confidence × Ease (not sum; range 1–1,000)
   - Sorted descending by ICE Score
8. **No hallucinated metrics** — Validate that goal targets are achievable given budget tier and industry CAC benchmarks. Example: If budget is <$1K/month and industry median CAC is $200, a goal of "5,000 signups in 6 months" is implausible. Flag for review.
9. **Channel metrics realistic** — Each channel's primary metric target must align with historical performance for that channel in the same industry

---

## How This Connects to Other Systems

- **Onboarding ([2C])**: The bootstrap templates follow a simplified GACCS format. When LLM generation ships in [6A], the templates become fallbacks for offline/error scenarios.
- **Task Decomposer ([6B])**: Reads the Schedule and Experiment Backlog sections to generate daily tasks. The structured format makes parsing reliable.
- **Strategy Refiner ([9B])**: Compares actual results against Success Criteria to generate refinement suggestions. Structured phases make diff-based suggestions possible.
