# Strategy Refiner Reference — Reference for Phase [9B]

> **Purpose**: Documents the logic and domain knowledge for `packages/prompts/src/strategy-refiner.ts`, which takes a GACCS strategy doc + 30 days of results and produces actionable refinement suggestions. This is the "closing the loop" system — the moat.

---

## What the Strategy Refiner Does

**Input**:
1. Current GACCS strategy document
2. 30 days of aggregated results from `dtn_experiment_results`
3. Task completion rates by channel (from `dtn_task_event_log`)
4. CAC benchmarks for the industry (from `industry-cac-benchmarks.md`)
5. Org profile (industry, budget tier)

**Output**:
A list of 3–7 specific refinement suggestions, each with:
- Category (channel_swap, budget_realloc, experiment_add, experiment_kill, goal_adjust, audience_refine)
- Target section (which GACCS section to modify)
- Current state (what the strategy says now)
- Suggested change (specific proposed modification)
- Evidence (data points supporting the suggestion)
- Confidence (high/medium/low)
- Impact estimate (what improvement to expect)

---

## Signal vs. Noise: What Constitutes Actionable Data

### Minimum Data Thresholds (by tier)

The refiner should NOT suggest changes based on insufficient data. Minimum thresholds vary by org stage:

| Signal | Bootstrap | Growth | Scale |
|--------|-----------|--------|-------|
| Channel performing well | 8+ tasks, 14+ days | 15+ tasks, 20+ days | 25+ tasks, 25+ days |
| Channel underperforming | 8+ tasks, 14+ days, <50% benchmark | 15+ tasks, 20+ days, <50% benchmark | 25+ tasks, 25+ days, <30% benchmark |
| Experiment succeeded | Single positive result vs. baseline | 1.5x baseline, 2+ data points | Statistical significance (p<0.1) |
| Experiment failed | 2+ attempts below threshold | 2+ attempts below threshold | 3+ attempts, 95% CI below threshold |
| Audience mismatch | 2+ experiments with weak results | 3+ experiments below benchmark | 5+ experiments, pattern clear |
| Budget misallocation | 10+ days spend data, >30% variance | 20+ days spend data, >30% variance | 20+ days spend data, >20% variance |

### Red Flags (always surface)

Some patterns warrant immediate suggestions regardless of volume:

- **Zero tasks completed** in a channel for 10+ consecutive days → suggest channel_swap or investigate blockers
- **100% task failure** in a channel over 5+ tasks → flag for review
- **Budget overspend** >50% on any channel → immediate budget_realloc suggestion
- **Experiment stuck** in backlog for 20+ days with no progress → suggest experiment_kill or rescope

---

## Refinement Categories

### 1. channel_swap
**When**: A channel is consistently underperforming while a middle-ring channel (from Bullseye) shows promise.

**Evidence required**:
- Primary channel CAC > 2x industry median AND LTV:CAC ratio < 2:1 for that channel for 20+ days
- OR task completion rate <30% in channel for 15+ tasks
- AND a middle-ring channel alternative exists

**Attribution check**: Before suggesting a channel swap, verify the underperforming channel isn't a critical awareness driver. If Channel A shows low last-touch conversion but high first-touch attribution (>30% of conversions first encountered Channel A), it may be driving pipeline that other channels convert. Flag for manual review instead of automatic swap suggestion.

**LTV normalization note**: When comparing channels, use LTV:CAC ratio (not raw CAC) as the primary comparison metric. A channel with $500 CAC and $5,000 LTV (10:1) is healthier than one with $100 CAC and $200 LTV (2:1).

**Suggestion format**:
```
Replace [Channel A] with [Channel B] in your primary channel mix.
- Channel A performance: [metric] vs [benchmark] over [N] days
- Channel A LTV:CAC ratio: [ratio] (target: >3:1)
- Channel B was ranked [position] in your Bullseye middle ring
- Expected improvement: [estimate based on benchmarks]
```

### 2. budget_realloc
**When**: Actual spend distribution diverges significantly from the GACCS plan, or one channel's ROI is clearly superior.

**Evidence required**:
- Channel with >2x average ROI of other channels
- OR budget allocation variance >30% from plan for 15+ days
- LTV:CAC ratio comparison (not raw CAC) shows superior channel

**Suggestion format**:
```
Shift [X]% of budget from [Channel A] to [Channel B].
- Channel B LTV:CAC ratio: [ratio] vs Channel A: [ratio]
- Channel B is returning [metric] per dollar vs Channel A's [metric]
- Current allocation: A=[X]%, B=[Y]%
- Suggested allocation: A=[X']%, B=[Y']%
```

### 3. experiment_add
**When**: Results reveal an opportunity not in the current backlog.

**Evidence required**:
- A successful experiment suggests a natural follow-up
- OR an emerging channel/tactic shows early positive signal
- OR competitor intelligence suggests an untapped opportunity

**Suggestion format**:
```
Add new experiment: "[experiment title]"
- Based on: [successful experiment or emerging signal]
- Estimated ICE: Impact=[X], Confidence=[Y], Ease=[Z] → [total]
- Insert into backlog at position [N]
```

### 4. experiment_kill
**When**: An experiment has been tried and failed, or conditions have changed making it irrelevant.

**Evidence required**:
- 2+ attempts with results below minimum viable threshold
- OR external conditions changed (platform policy, budget cut, etc.)

**Suggestion format**:
```
Remove experiment: "[experiment title]" from backlog.
- Attempted [N] times, results: [summary]
- Threshold for success was [metric], achieved [actual]
- Recommendation: [replace with X / reallocate effort to Y]
```

### 5. goal_adjust
**When**: Current trajectory makes a goal unreachable, or a goal has been achieved early.

**Evidence required**:
- Linear projection from 30-day data shows goal will be missed by >30%
- OR goal already achieved (celebrate + set new target)

**Suggestion format**:
```
Adjust goal: "[current goal]"
- Current trajectory: [projection]
- Original target: [target]
- Suggested revision: [new target]
- Rationale: [data-backed explanation]
```

### 6. audience_refine
**When**: Results suggest the actual converting audience differs from the strategy's defined audience.

**Evidence required**:
- 3+ experiments with audience data showing a different demographic/segment converting
- OR task completion data suggests content resonates with a different audience

**Suggestion format**:
```
Refine audience definition.
- Strategy targets: [current primary audience]
- Actual converters: [observed audience characteristics]
- Suggested update: Add/modify [segment] as [primary/secondary]
- Content implication: [how content pillars should shift]
```

---

## Suggestion Prioritization

When multiple suggestions are generated, rank by:

1. **Revenue impact**: Suggestions that directly affect revenue or conversion first
2. **Confidence level**: High confidence > medium > low
3. **Ease of implementation**: Quick wins before structural changes
4. **Urgency**: Red flags before optimizations

**Max suggestions**: 7. If more candidates exist, keep the top 7 by priority and mention "N additional observations available for review."

---

## Compliance-Sensitive Suggestions (Fintech/Healthtech)

Any refinement suggestion that involves:
- New content types (blog posts, case studies, ads)
- Channel changes that affect compliance review workflow
- Claims, testimonials, or clinical data

Must be routed to a **compliance_approval** queue (separate from general approvals). Tag with `[COMPLIANCE_REVIEW_REQUIRED]`.

---

## Approval Flow

Every refinement suggestion goes through the human-in-the-loop approval queue (from [4B]):

1. Suggestion generated by refiner
2. Created as an `approval_item` with type `strategy_refinement`
3. Org owner reviews in approval UI
4. **Accept**: Strategy doc updated with suggested change. New version created.
5. **Reject**: Suggestion dismissed. Stored for learning (don't re-suggest same thing).
6. **Modify**: Owner edits suggestion before applying. Modified version stored for learning.

**Never auto-apply**: Strategy changes always require human approval. This is a core design principle.

---

## Prompt Structure

```
You are a marketing strategy advisor reviewing 30 days of performance data.

Current Strategy (GACCS):
{strategy_doc_full}

Performance Summary (30 days):
- Tasks completed: {total} ({completion_rate}%)
- By channel: {channel_breakdown}
- Experiments completed: {experiments_completed}
- Experiments in progress: {experiments_in_progress}
- Budget spent: ${total_spent} of ${budget_planned}

Experiment Results:
{experiment_results_table}

Industry Benchmarks:
{cac_benchmarks_for_industry}

Task Outcomes by Channel:
{channel_task_outcomes}

Generate 3–7 specific refinement suggestions. For each:
1. Category: channel_swap | budget_realloc | experiment_add | experiment_kill | goal_adjust | audience_refine
2. Target GACCS section
3. Current state (quote from strategy doc)
4. Suggested change (specific, actionable)
5. Evidence (cite specific data points from the performance summary)
6. Confidence: high | medium | low
7. Expected impact

Rules:
- Only suggest changes backed by sufficient data (see minimum thresholds)
- Flag red flags regardless of data volume
- Never suggest removing all experiments from a channel — reallocate instead
- Be specific: "Shift 20% of budget from SEO to Email" not "Consider adjusting budget"
- Rank suggestions by expected revenue impact

Output as JSON array.
```

---

## Diff-Based Version Control

When a suggestion is accepted, the strategy doc is updated using a structured diff:

```typescript
interface StrategyDiff {
  version: number;  // incremented
  previousVersion: number;
  appliedAt: string;  // ISO timestamp
  suggestion: RefinementSuggestion;
  sectionModified: "goals" | "audience" | "channels" | "content" | "schedule" | "experiments";
  oldContent: string;  // exact text replaced
  newContent: string;  // replacement text
  appliedBy: string;  // user ID
}
```

This enables:
- Full audit trail of strategy evolution
- Rollback to any previous version
- Learning loop: which suggestion types get accepted vs. rejected
- Refinement of the refiner prompt based on acceptance patterns

---

## How This Connects to Other Systems

- **Strategy Refiner ([9B])**: `strategy-refiner.ts` implements the prompt and suggestion logic
- **Results Dashboard ([9A])**: Provides the 30-day aggregated data the refiner consumes
- **Experiment Tracker ([9A])**: Experiment results table feeds evidence for suggestions
- **Approval Queue ([4B])**: Suggestions become approval items
- **Strategy Generator ([6A])**: Refiner updates the same doc format the generator creates
- **CAC Benchmarks**: Referenced for channel performance comparison
- **Task Decomposer ([6B])**: After strategy is refined, the next day's task decomposition reflects the updated strategy
