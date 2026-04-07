# Blocker Classifier Example Corpus — Reference for Phase [7A]

> **Purpose**: These 15 pre-classified marketing blocker examples serve two roles:
> 1. **Few-shot examples** in the blocker classifier prompt (`packages/prompts/src/blocker-classifier.ts`)
> 2. **Snapshot test fixtures** — the classifier must correctly categorize all 15 to pass tests
>
> Blocker types defined in `packages/types/src/blockers.ts`:
> `knowledge_gap | dependency | skill_gap | resource_constraint | decision_needed`

---

## Blocker Type Definitions

| Type | Description | Typical Resolution |
|------|-------------|-------------------|
| `knowledge_gap` | Missing information needed to proceed. The answer exists but we don't have it yet. | Research Agent (RAG + web search) |
| `dependency` | Blocked on another person, team, or external deliverable. Can't proceed until they act. | Escalation (notify → remind → escalate) |
| `skill_gap` | The assignee lacks the skill or tool proficiency to execute. The task itself is clear. | Draft Agent (generate template/brief) or reassign to capable executor |
| `resource_constraint` | Insufficient budget, credits, tool access, or time to execute as planned. | Replan (smaller scope, cheaper channel, defer) |
| `decision_needed` | A strategic or tactical decision must be made before work can continue. Multiple valid paths. | Surface to org owner via approval queue |

---

## Classified Examples

### 1. knowledge_gap
> **Task**: "Write blog post comparing our pricing to Competitor X"
> **Blocker**: "I can't find Competitor X's current pricing anywhere on their site — it says 'Contact Sales' for all tiers."

**Why knowledge_gap**: The information exists (Competitor X has pricing) but we don't have access to it. Research Agent can search review sites, G2, or cached pages.

---

### 2. knowledge_gap
> **Task**: "Create Instagram ad targeting for our fitness audience"
> **Blocker**: "I don't know what audience demographics or interest categories perform best for fitness DTC brands on Meta."

**Why knowledge_gap**: Best practices and benchmark data exist; the blocker is not knowing them. Research Agent can pull Meta ads benchmarks.

---

### 3. knowledge_gap
> **Task**: "Set up email welcome series for new signups"
> **Blocker**: "What's our current average time-to-first-action for new users? I need this to time the email sequence correctly."

**Why knowledge_gap**: Internal data exists in analytics but hasn't been surfaced. Research Agent can query or the user can be prompted to check.

---

### 4. dependency
> **Task**: "Publish the case study blog post"
> **Blocker**: "Waiting on the customer (Acme Corp) to approve the final draft. Sent for review 3 days ago, no response."

**Why dependency**: Blocked on an external party's action. Resolution is escalation: remind → follow up → offer alternative (anonymize).

---

### 5. dependency
> **Task**: "Launch Meta retargeting campaign"
> **Blocker**: "The Meta pixel hasn't been installed on our site yet. Dev team said they'd do it last sprint but it's not in the deploy."

**Why dependency**: Blocked on the engineering team completing a prerequisite. Escalation to unblock.

---

### 6. dependency
> **Task**: "Send the weekly newsletter"
> **Blocker**: "The product team hasn't shared the feature update copy they promised for this week's issue."

**Why dependency**: Waiting on another team's deliverable. Escalation path: remind product team → use placeholder copy → skip section.

---

### 7. skill_gap
> **Task**: "Create an animated explainer video for the landing page"
> **Blocker**: "I don't know how to use After Effects or any video editing tools. I'm a content writer."

**Why skill_gap**: The task is clear but the assignee lacks the technical skill. Resolution: Draft Agent generates a brief + storyboard → reassign to a freelancer or video executor, or suggest a simpler format (Loom walkthrough).

---

### 8. skill_gap
> **Task**: "Build a custom analytics dashboard in Looker"
> **Blocker**: "I've never used Looker before and don't know LookML. I can define what metrics we need but can't build it."

**Why skill_gap**: Clear deliverable, wrong assignee for execution. Draft Agent can generate a Looker requirements spec → reassign or suggest Google Sheets alternative.

---

### 9. skill_gap
> **Task**: "Write Facebook ad copy variations for A/B testing"
> **Blocker**: "I've never written paid ad copy before. My background is long-form content. I don't know the character limits, best practices, or hook patterns."

**Why skill_gap**: Specific craft skill gap. Draft Agent can generate ad copy templates with best practices baked in.

---

### 10. resource_constraint
> **Task**: "Run a $500/month Google Ads campaign targeting 'project management software'"
> **Blocker**: "Our total monthly marketing budget is $800 and we're already spending $400 on other channels. We can't allocate $500 to Google Ads."

**Why resource_constraint**: Insufficient budget. Resolution: replan with smaller budget ($200 test), target cheaper long-tail keywords, or defer to next quarter.

---

### 11. resource_constraint
> **Task**: "Generate 20 SEO-optimized blog posts this month"
> **Blocker**: "We only have 50 AI credits left and each blog post uses ~5 credits. That's only 10 posts. We'd need to upgrade our plan."

**Why resource_constraint**: Credit/plan limitation. Resolution: reduce scope to 10 posts, prioritize by ICE score, or prompt for plan upgrade.

---

### 12. resource_constraint
> **Task**: "Hire a freelance designer for the landing page redesign"
> **Blocker**: "We don't have a Fiverr or Upwork account set up, and the org hasn't allocated budget for freelancers."

**Why resource_constraint**: Missing tool access and budget allocation. Resolution: suggest free alternatives (Canva templates), use internal resources, or surface budget request.

---

### 13. decision_needed
> **Task**: "Choose the hero messaging for the homepage"
> **Blocker**: "We have three strong positioning options: 'Save 10 hours/week', 'Your AI marketing team', and 'Marketing on autopilot'. The team is split. Need founder to decide."

**Why decision_needed**: Multiple valid options, no clear winner, strategic decision. Surface to org owner via approval queue with a recommendation.

---

### 14. decision_needed
> **Task**: "Set up the referral program structure"
> **Blocker**: "Should the referral reward be a credit ($10), an extended trial (14 days), or a percentage discount (20% off first month)? Each has different margin implications."

**Why decision_needed**: Strategic choice with financial implications. Needs org-level decision. Surface with pros/cons analysis.

---

### 15. decision_needed
> **Task**: "Plan the content calendar for Q2"
> **Blocker**: "Are we pivoting to target enterprise customers this quarter, or staying focused on SMB? The content strategy is completely different depending on this."

**Why decision_needed**: High-level strategic direction question. Content plan can't proceed until ICP decision is made. Surface to org owner with impact analysis of each path.

---

### 16. dependency
> **Task**: "Send personalized demo to enterprise prospect"
> **Blocker**: "Waiting on sales engineer to build custom demo environment. Requested 5 days ago."

**Why dependency**: Blocked on another person (sales engineer) completing a prerequisite task. Resolution is escalation: remind → follow up → offer alternative (generic demo).

---

### 17. knowledge_gap
> **Task**: "Write integration guide for Stripe"
> **Blocker**: "Don't know which Stripe API version our users are predominantly on. Need analytics data."

**Why knowledge_gap**: Information exists in our analytics but hasn't been pulled yet. Research Agent can query analytics or the user can check dashboard to determine which API version is most used.

---

### 18. dependency
> **Task**: "Launch demand-side Google Ads campaign"
> **Blocker**: "Only 8 supply-side providers have active listings. Need minimum 15 before driving demand traffic."

**Why dependency**: Blocked on the supply-side team onboarding more providers. Marketplace demand-side can't effectively scale before supply exists. Resolution: escalate to supply team with urgency → negotiate timeline → run limited demand campaign to test.

---

### 19. resource_constraint
> **Task**: "Publish pilot program case study"
> **Blocker**: "Clinical advisor is only available 4 hours/week and has 3-week backlog of content reviews."

**Why resource_constraint**: Insufficient resource allocation (clinical advisor time). Resolution: deprioritize case study, find alternative advisor, simplify review scope, or extend timeline.

---

### 20. decision_needed
> **Task**: "Create landing page for new savings product"
> **Blocker**: "Legal hasn't confirmed whether we can advertise APY rates before our banking partner agreement is finalized."

**Why decision_needed**: Can't proceed without legal/business decision. Multiple paths: wait for agreement, use placeholder rates, launch with different messaging. Surface to org owner with risk analysis of each option.

---

### 21. dependency
> **Task**: "Publish blog post on EHR workflow improvements"
> **Blocker**: "Medical advisor needs to review clinical accuracy claims. MLR review queue is 5-8 business days."

**Why dependency**: Blocked on medical advisor and MLR (Medical Legal Review) process. Regulatory-adjacent dependency. Resolution: expedite review request → offer summary format instead of full post → schedule for future when queue clears.

---

### 22. knowledge_gap
> **Task**: "Write comparison page vs. traditional banks"
> **Blocker**: "FTC substantiation requirements unclear — do we need third-party data to back up our fee comparison claims?"

**Why knowledge_gap**: Information about regulatory requirements exists but we haven't researched it. Research Agent can search FTC guidelines and fintech compliance resources. Note: Could also route to Legal for definitive answer if uncertain.

---

### 23. resource_constraint
> **Task**: "Scale supply-side outreach to 100 providers"
> **Blocker**: "Only one person doing outreach. At current 3-5% conversion rate, need to contact 2000-3000 prospects. Don't have the tooling or time."

**Why resource_constraint**: Insufficient personnel and tooling. Resolution: hire outreach specialist, automate outreach workflow with n8n, narrow target list to high-intent segments, or defer scaling.

---

### 24. skill_gap (PRIMARY)
> **Task**: "Set up Google Ads campaign"
> **Blocker**: "Never configured Google Ads AND we only have $200/month budget, not the $500 minimum the template assumed."

**Why skill_gap**: The PRIMARY blocker is the skill gap. The person lacks Google Ads configuration experience. If they had the skill, they could run a viable $200 test on long-tail keywords (no $500 minimum required). Budget constraint is secondary. Resolution: Draft Agent generates simplified $200-budget Google Ads brief → suggest long-tail keyword strategy → or reassign to freelancer.

---

### 25. decision_needed
> **Task**: "Launch TikTok ad campaign"
> **Blocker**: "Should we use UGC-style content or polished product shots? Each requires different creative investment and targeting strategy. CEO and marketing lead disagree."

**Why decision_needed**: Strategic choice with resource implications. Multiple valid paths (UGC vs. polished). Internal disagreement means this needs org-level decision. Resolution: surface to CEO with pros/cons → test both approaches → or defer until org alignment is reached.

---

## Distribution Summary

| Type | Count | Examples |
|------|-------|---------|
| knowledge_gap | 5 | #1, #2, #3, #17, #22 |
| dependency | 6 | #4, #5, #6, #16, #18, #21 |
| skill_gap | 4 | #7, #8, #9, #24 |
| resource_constraint | 5 | #10, #11, #12, #19, #23 |
| decision_needed | 5 | #13, #14, #15, #20, #25 |

---

## Tiebreaker Rules (Multi-Type Blockers)

When a blocker could be classified as multiple types:

1. **Ask: What is the ROOT CAUSE?** If removing one type unblocks the task, that's the primary.
2. **Hierarchy**: dependency > decision_needed > resource_constraint > skill_gap > knowledge_gap
   - If blocked on a person AND a decision: classify as dependency (the person is the bottleneck)
   - If blocked on budget AND skill: classify as skill_gap if a cheaper approach exists, else resource_constraint
3. **Compliance blockers**: Always classify legal/regulatory review dependencies as dependency, not knowledge_gap. Route to escalation, not research.
4. **Tag secondary type**: The classifier should output primary type + optional secondary type for routing.

---

## Usage in Prompt and Tests

### In the classifier prompt:
```
You are a marketing task blocker classifier. Given a task description and a blocker description, classify the blocker into exactly one of: knowledge_gap, dependency, skill_gap, resource_constraint, decision_needed.

[Include 5 few-shot examples — one per type, drawn from examples #1, #4, #7, #10, #13]

Now classify this blocker:
Task: "{task_title}"
Blocker: "{blocker_description}"
Classification:
```

### In snapshot tests:
```typescript
// packages/prompts/src/__tests__/blocker-classifier.test.ts
import { BLOCKER_CORPUS } from "../reference/blocker-corpus";
import { classifyBlocker } from "../blocker-classifier";

test.each(BLOCKER_CORPUS)("classifies '$task' blocker correctly", async ({ task, blocker, expected }) => {
  const result = await classifyBlocker(task, blocker);
  expect(result.type).toBe(expected);
});

// This test must pass for all 25 examples to ensure the classifier generalizes
```

---

## How This Connects to Other Systems

- **Blocker Classifier ([7A])**: `blocker-classifier.ts` uses examples #1, #4, #7, #10, #13 as few-shot examples in the prompt
- **Escalation Logic ([7A])**: `dependency` type blockers trigger the PagerDuty-style escalation (24hr → 48hr → 72hr)
- **Research Agent ([7A])**: `knowledge_gap` blockers route to the Research Agent
- **Draft Agent ([7A])**: `skill_gap` blockers route to the Draft Agent for template/brief generation
- **Approval Queue ([4B])**: `decision_needed` blockers create approval items for the org owner
