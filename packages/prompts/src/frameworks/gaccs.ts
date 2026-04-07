import { getMaxChannels } from "../types.js";
import type { OrgProfile, PromptFragment } from "../types.js";

export function buildGaccsPrompt(org: OrgProfile): PromptFragment {
  const maxChannels = getMaxChannels(org.budgetTier);

  return {
    frameworkId: "gaccs",
    order: 6,
    content: `## GACCS Output Structure

Structure your output as a GACCS strategy brief using this EXACT markdown format. Every section is mandatory.

\`\`\`
# [Strategy Title]

## Goals
- [Goal 1 - specific, measurable, time-bounded]
- [Goal 2]
- [Goal 3]
(3–5 goals required, each with numeric targets)

## Audience
- **Primary**: [Who they are, company size/type, role]
- **Secondary**: [Adjacent audience worth reaching]
- **Pain points**: [Point 1], [Point 2], [Point 3] (3–5 required)
- **Watering holes**: [Location 1], [Location 2], [Location 3] (2–3 required)

## Channels
1. **[Channel Name]** ([owned/earned/paid]) — [Rationale tied to audience watering holes]. Primary metric: [Metric]. Budget: [X]%.
2. **[Channel Name]** ([type]) — [Rationale]. Primary metric: [Metric]. Budget: [X]%.
3. **[Channel Name]** ([type]) — [Rationale]. Primary metric: [Metric]. Budget: [X]%.
(Exactly ${maxChannels} channels max. Budget allocations MUST sum to 100%.)

## Content
### Pillars
- [Pillar 1]
- [Pillar 2]
- [Pillar 3]
(3–4 pillars required)

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
- **Actions**: [Action 1], [Action 2], [Action 3] (3–5 required)
- **Success criteria**: [Criteria 1], [Criteria 2]
- **Decision point**: [Key question to evaluate before next phase]

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
| [Description] | [1-10] | [1-10] | [1-10] | [I×C×E] |
(Minimum 8 experiments. Sorted by ICE Score descending.)
\`\`\`

CRITICAL REQUIREMENTS:
- All 6 sections must be present: Goals, Audience, Channels, Content, Schedule, Experiment Backlog
- Goals must have numeric targets (e.g., "200 signups" not "increase signups")
- Channel budget allocations must sum to exactly 100%
- Schedule must have exactly 3 phases (Months 1–2, 3–4, 5–6)
- Each schedule phase must include Theme, Actions, Success criteria, and Decision point
- Experiment Backlog must have minimum 8 rows
- ICE Score = Impact × Confidence × Ease (multiplication, range 1–1000, NOT addition)`,
  };
}
