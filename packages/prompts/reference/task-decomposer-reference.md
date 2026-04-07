# Task Decomposer Reference — Reference for Phase [6B]

> **Purpose**: Documents the logic, heuristics, and domain knowledge that `packages/prompts/src/task-decomposer.ts` needs to convert a GACCS strategy document into a prioritized daily task list. This is the reference material for implementing the decomposition prompt in [6B].

---

## What the Task Decomposer Does

**Input**:
1. Active GACCS strategy document (from `mktg_strategy_docs`)
2. Yesterday's task outcomes (from `dtn_task_event_log`)
3. ICE-scored experiment backlog (from strategy doc)
4. Current day of week
5. Org profile (industry, budget tier, timezone)

**Output**:
A prioritized list of 3–7 daily tasks, each with:
- Title (actionable, starts with a verb)
- Description (1–2 sentences, specific enough to execute)
- Estimated duration (in minutes)
- Priority (1 = highest)
- Executor type suggestion (self, claude_api, n8n, freelancer, or BYOS executor)
- Strategy section reference (links back to GACCS section)
- ICE experiment reference (if derived from backlog)

---

## Decomposition Heuristics

### 1. Daily Task Budget

A realistic marketing operator day has **4–6 hours of productive task time**. The decomposer respects these constraints:

| Budget Tier | Target Daily Tasks | Total Duration Target |
|-------------|-------------------|----------------------|
| Bootstrap | 3–5 tasks | 3–4 hours |
| Growth | 4–6 tasks | 4–5 hours |
| Scale | 5–7 tasks | 5–6 hours |

**Hard rule**: Never generate more than 7 tasks. Overwhelm kills execution.

### 1.5. Solo Founder Mode (Bootstrap default)

Most bootstrap founders are building product AND doing marketing. The default task budget assumes marketing is the only job. When `org.team_size === 1`:

| Mode | Daily Tasks | Duration Target | Rationale |
|------|------------|----------------|-----------|
| Solo founder (building + marketing) | 1–2 focused + 2–3 lightweight | 1.5–2 hours | Product is primary; marketing fits around it |
| Dedicated marketer (Bootstrap) | 3–5 tasks | 3–4 hours | Full-time on marketing |
| Small team (Growth) | 4–6 tasks | 4–5 hours | Distributed across team |

**Lightweight tasks** (≤15 min each): social media post, community reply, email check, metric glance
**Focused tasks** (30–90 min): blog post draft, outreach batch, email sequence setup, strategy review

If solo founder: generate max 2 focused tasks + 3 lightweight tasks per day. Friday = review only (1 focused task: weekly metrics review).

### 2. Day-of-Week Patterns

Marketing tasks follow weekly rhythms. The decomposer adjusts task mix by day:

| Day | Task Mix Emphasis | Rationale |
|-----|------------------|-----------|
| **Monday** | Planning + setup tasks | Start-of-week reset; review last week's metrics, plan this week's content |
| **Tuesday** | Content creation | Peak creative energy; writing, design, video |
| **Wednesday** | Content creation + outreach | Mid-week push; publishing, email sends, partner outreach |
| **Thursday** | Distribution + engagement | Share content, engage on social, respond to comments, email newsletter |
| **Friday** | Analysis + optimization | End-of-week review; check metrics, update experiments, plan next week |
| **Saturday** | Light engagement only (if any) | Social monitoring, community responses — never schedule heavy work |
| **Sunday** | Nothing scheduled | Rest day. No tasks generated. |

### 3. Carry-Over Logic

When yesterday's tasks have incomplete outcomes, the decomposer applies these rules:

| Yesterday's Outcome | Today's Action |
|---------------------|----------------|
| **Completed** | Don't repeat. Move to next experiment or next step in sequence. |
| **Failed** (executor error) | Retry with same or different executor. Priority +1 (higher). |
| **Failed** (blocker reported) | Don't retry. Blocker system handles this. Generate a related but different task. |
| **Skipped** (user chose to skip) | Move to tomorrow with same priority. If skipped 2 days in a row, deprioritize. |
| **Carried over** (not attempted) | Include today with priority +1. If carried over 3+ days, flag for review. |

### 4. Channel Balance

The daily task list should roughly reflect the budget allocation from the GACCS Channels section. If Channel A has 50% budget allocation, ~50% of weekly tasks should relate to it.

**Weekly task distribution formula**:
```
tasks_per_channel_per_week = (channel_budget_pct / 100) * weekly_task_count
```

The decomposer tracks rolling channel distribution and rebalances when a channel is under/over-represented over the past 5 days.

### 5. Experiment Progression

The ICE backlog experiments decompose into multi-day task sequences. Not every experiment is a single task.

**Experiment → Task mapping examples**:

| Experiment | Day 1 Task | Day 2 Task | Day 3 Task |
|-----------|-----------|-----------|-----------|
| "Publish 8 SEO articles" | Research keywords for article 1 | Write article 1 draft | Edit and publish article 1 |
| "Email welcome series" | Map welcome email sequence (3 emails) | Write welcome email 1 | Write welcome email 2 |
| "Founder LinkedIn posting 3x/week" | Write LinkedIn post | (recurs Mon/Wed/Fri) | — |
| "Meta retargeting campaign" | Set up Meta pixel verification | Create retargeting audience | Create first ad set with 2 variations |

The decomposer maintains experiment progress state to know which step comes next.

---

## Task Title Conventions

All generated task titles must follow these patterns:

**Verb starters** (always begin with an action verb):
- Write, Draft, Publish, Create, Design
- Research, Analyze, Review, Audit
- Set up, Configure, Connect, Install
- Send, Share, Post, Distribute
- Optimize, Update, Revise, Improve
- Schedule, Plan, Outline, Map

**Bad titles** (the decomposer must never generate these):
- "Blog post" (no verb)
- "Work on SEO" (vague)
- "Marketing stuff" (meaningless)
- "Continue from yesterday" (no specific action)

**Good titles**:
- "Write first draft of SEO article: '5 Ways to Reduce Sprint Planning Time'"
- "Research top 10 long-tail keywords for 'project management' cluster"
- "Post LinkedIn update about this week's product release"
- "Review email welcome series open rates and adjust subject lines"

---

## Executor Assignment Heuristics

The decomposer suggests an executor type based on task characteristics:

| Task Characteristic | Suggested Executor | Rationale |
|--------------------|-------------------|-----------|
| Writing/content creation (drafts) | `claude_api` | LLM excels at first drafts |
| Writing/content creation (final edit) | `self` | Human judgment for voice/tone |
| Research and data gathering | `claude_api` | LLM + RAG good at synthesis |
| Social media posting | `self` or `n8n` | Self for personal posts, n8n for scheduled distribution |
| Email campaign setup | `self` | Requires ESP tool interaction |
| Design tasks | `freelancer` or `self` | Depends on skill; defer to skill_gap blocker if needed |
| Analytics/metric review | `self` | Requires dashboard interpretation |
| Automation setup | `n8n` | Workflow automation tool |
| Ad campaign management | `self` | Requires ad platform interaction |
| Content for external tools (Jasper, etc.) | BYOS executor | Route to user's own subscription |

**Override rule**: If the org has a BYOS executor connected for a capability (e.g., Jasper for content_generation), prefer it over `claude_api` for that capability. Check `org_integrations` table.

### Executor Rules by Team Size

| Team Size | self | marketing_operator | claude_api | freelancer |
|-----------|------|-------------------|------------|------------|
| Solo founder | All strategy + execution | N/A | Drafts, research | Design (if budget) |
| Founder + first hire | Strategy, approval, analytics | Execution, content, email, social | First drafts | Design, video |
| Small team (3-5) | Strategy, approval | Channel specialists execute | Research, drafts, analysis | Specialist overflow |

Transition trigger: When founder spends >15 hours/week on GTM tasks AND budget >$3K/month, recommend first marketing hire.

---

## Duration Estimation

Standard duration estimates by task type (used as defaults, can be refined by learning):

| Task Type | Estimated Duration |
|-----------|-------------------|
| Write blog post draft (1,000–2,000 words) | 90 min |
| Repurpose blog post into 3 social posts | 20 min |
| Write social media post | 15 min |
| Cold outreach batch (20 personalized emails) | 60 min |
| Research/keyword analysis | 45 min |
| Email copy (single email) | 30 min |
| Review analytics dashboard | 20 min |
| Set up ad campaign | 60 min |
| Design review/feedback | 20 min |
| Community engagement (respond to comments) | 30 min |
| Publish/distribute content | 15 min |
| Strategic planning/weekly review | 45 min |
| Compliance review (Fintech/Healthtech) | +5-8 business days |

**Constraint**: Sum of all task durations must not exceed the budget tier's target daily hours.

**For regulated industries**: Submit Risk Tier 2-3 content for compliance review on Monday, expect approval by following week.

---

## Prompt Structure

The decomposition prompt is assembled as:

```
You are a marketing operations assistant. Your job is to create today's prioritized task list for a {industry} marketing team on a {budget_tier} budget.

Context:
- Today is {day_of_week}, {date}
- Active strategy: {strategy_doc_summary}
- Current GACCS phase: {current_phase} (Months {month_range})
- Channel allocation: {channel_1} ({pct_1}%), {channel_2} ({pct_2}%), {channel_3} ({pct_3}%)

Yesterday's outcomes:
{yesterday_task_outcomes}

Experiment backlog (sorted by ICE):
{ice_backlog_top_10}

Experiment progress:
{experiment_state}

Channel balance (last 5 days):
{channel_distribution_actual_vs_target}

Rules:
1. Generate {min_tasks}–{max_tasks} tasks
2. Total duration must not exceed {max_hours} hours
3. Every task starts with a verb
4. Day-of-week pattern: {day_pattern_description}
5. Carry forward: {carry_over_items}
6. Channel balance: prioritize under-represented channels
7. Include strategy_section_ref and experiment_id for each task

Output as JSON array: [{ title, description, duration_minutes, priority, executor_type, strategy_section_ref, experiment_id }]
```

---

## How This Connects to Other Systems

- **Task Decomposer ([6B])**: `task-decomposer.ts` implements this logic
- **Strategy Generator ([6A])**: Produces the GACCS doc that this system consumes
- **State Machine ([3B])**: Task status transitions feed the carry-over logic
- **Event Log ([4A])**: Yesterday's outcomes sourced from `dtn_task_event_log`
- **Executor Framework ([6C])**: Executor suggestions validated against `org_integrations`
- **Blocker System ([7A])**: Failed tasks with blockers excluded from retry
- **Cron ([4A])**: Daily decomposition triggered by Inngest cron at org timezone morning
