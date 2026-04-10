# DoTheseNow — Knowledge Graph Findings

> Mismatches, gaps, and overlaps discovered during the KnowledgeGraph.md audit.
> Each entry traces the full call chain from trigger → action → query → DB and identifies where layers disagree.
>
> Generated: 2026-04-09

---

## State Machine Mismatches

### #9 — Checkbox uncheck: completed → pending

**Severity:** High — UI allows action that will throw
**Entry point:** Web UI
**Location:** `apps/web/src/components/daily-tasks/task-list.tsx:120`

**What happens:** When a user unchecks a completed task, the checkbox calls `updateDailyTask(task.id, { status: "pending" })`. The checkbox is enabled for completed tasks (line 161: `disabled={isPending || (isTerminal && !isComplete)}`).

**Why it fails:** `completed` is a terminal state in the task state machine (`supabase/migrations/013_task_event_log.sql:133`). The `transition_task_status()` RPC returns `ARRAY[]::TEXT[]` for terminal states — `pending` is not in the allowed list, so the RPC raises an exception.

**Call chain:**
```
Checkbox uncheck → updateDailyTask(id, {status: "pending"})
  → transitionTaskStatus(ctx, id, "pending", "web_ui", userId)
    → RPC: transition_task_status() → RAISE EXCEPTION
```

**Fix options:**
- Disable the checkbox for completed tasks: `disabled={isPending || isTerminal}`
- Or add a `reopen` transition in migration 013: `completed → pending` or `completed → in_progress`

---

### #10 — "Fail" action from pending status

**Severity:** Medium — action menu item triggers invalid transition
**Entry point:** Web UI
**Location:** `apps/web/src/components/daily-tasks/task-list.tsx:135`

**What happens:** The task action menu includes a "Fail" option that calls `updateDailyTask(task.id, { status: "failed" })`. This triggers `transitionTaskStatus()`.

**Why it fails:** `pending → failed` is not a valid transition. The state machine only allows `failed` from `in_progress` or `waiting_approval`.

**Valid transitions to `failed`:**
- `in_progress → failed` ✅
- `waiting_approval → failed` ✅
- `pending → failed` ❌

**Call chain:**
```
"Fail" menu item → updateDailyTask(id, {status: "failed"})
  → transitionTaskStatus(ctx, id, "failed", "web_ui", userId)
    → RPC: v_allowed = ['in_progress','waiting_approval','skipped','carried_over']
    → "failed" NOT IN v_allowed → RAISE EXCEPTION
```

**Fix:** Either hide "Fail" when `task.status === "pending"`, or add `pending → failed` to the state machine.

---

### #11 — Approval RPC bypasses task state machine

**Severity:** High — two state machines disagree + no audit trail
**Entry point:** Web UI + MCP
**Location:** `supabase/migrations/006_approval_review_rpc.sql:49-63`

**What happens:** The `review_approval_item()` RPC directly UPDATEs `dtn_daily_tasks.status` when processing a linked approval:
- Approval `approved` → task set to `completed`
- Approval `rejected` → task set to `failed`
- Approval `revision_requested` → task set to `in_progress`

**Why it's a problem:**

1. **Invalid transition:** `waiting_approval → completed` is NOT in the task state machine's valid transitions (migration 013 only allows `waiting_approval → in_progress/skipped/failed`). The direct UPDATE bypasses the RPC, so it succeeds at the DB level, but the two state machines disagree on what's valid.

2. **No audit trail:** `transition_task_status()` creates entries in `dtn_task_event_log`. The approval RPC's direct UPDATE does not. Task status changes triggered by approvals are invisible to the audit system.

**Call chain:**
```
ApprovalDetailSheet → reviewApprovalItem(id, "approved", notes)
  → reviewApproval(ctx, id, userId, {status: "approved"})
    → RPC: review_approval_item()
      → UPDATE dtn_daily_tasks SET status = 'completed'  -- bypasses transition_task_status()
      → (no INSERT into dtn_task_event_log)
```

**Fix:** Replace the direct UPDATE in the RPC with a call to `transition_task_status()`, and add `waiting_approval → completed` to the valid transitions in migration 013.

---

### #12 — Approval card: no from-status guard

**Severity:** Low — RPC catches it, but UX is bad
**Entry point:** Web UI
**Location:** `apps/web/src/components/approvals/approval-card.tsx:38`

**What happens:** The approval card's quick-approve button calls `reviewApprovalItem(item.id, "approved")` without checking if the item is still in a reviewable state. The detail sheet has an `isReviewable` guard (line 36-38: checks for `pending` or `revision_requested`), but the card does not.

**Why it's a problem:** If two users view the approval queue and one approves an item, the other user's card still shows the approve button until the list re-renders. Clicking it would attempt to re-approve an already-approved item. The RPC throws: "Cannot review item with status: approved."

**Fix:** Add the same `isReviewable` guard to the card component, or disable the button when `item.status !== "pending" && item.status !== "revision_requested"`.

---

### #13 — Blocker dismiss/resolve: no status guard

**Severity:** Medium — cascading throw on terminal task
**Entry point:** Web UI
**Location:** `apps/web/src/lib/blockers/actions.ts:77-128`

**What happens:** `dismissBlocker()` and `resolveBlockerManually()` update the blocker's `resolution_status` without checking its current value. After updating the blocker, they call `transitionTaskStatus(blocker.task_id, "in_progress")` to unblock the task.

**Why it's a problem:** If the blocker was already resolved (e.g., by Inngest's automated resolution) and the task has moved to a terminal state (completed, skipped, etc.), the `transitionTaskStatus()` call will throw because terminal states have no valid transitions. The blocker status update succeeds (no DB constraint on transitions), but the task transition fails.

**Call chain:**
```
Dismiss button → dismissBlocker(blockerId)
  → updateBlocker(ctx, id, {resolution_status: "dismissed"})  -- succeeds (no transition check)
  → transitionTaskStatus(ctx, taskId, "in_progress", "web_ui", userId)
    → RPC: task.status = "completed" → ARRAY[]::TEXT[] → "in_progress" NOT IN [] → RAISE EXCEPTION
```

**Fix:** Check `resolution_status` before updating — skip if already resolved/dismissed. Check task status before transitioning — skip if already terminal.

---

## MCP / Chat Entry Point Mismatches

### #14 — MCP `update_daily_task`: no step-through for pending → completed

**Severity:** Medium — Claude gets an error and wastes a tool call
**Entry point:** MCP (Cowork + Chat)
**Location:** `packages/mcp-server/src/tools/daily-tasks.ts:240-276`

**What happens:** The MCP `update_daily_task` tool calls `transitionTaskStatus()` directly with whatever status Claude provides. Unlike the web UI's `completeDailyTask()` which auto-steps through `pending → in_progress → completed`, the MCP path has no step-through logic.

**Why it's a problem:** If Claude sends `{status: "completed"}` for a task that's still `pending`, the RPC throws `Invalid status transition: pending → completed`. Claude sees an error, may retry, and wastes tool calls. The system prompt at `apps/web/src/app/api/v1/chat/route.ts:113` doesn't mention this constraint.

**Call chain:**
```
Claude tool call: update_daily_task({task_id, status: "completed"})
  → transitionTaskStatus(ctx, taskId, "completed", "mcp")
    → RPC: pending → completed NOT IN ['in_progress','waiting_approval','skipped','carried_over']
    → RAISE EXCEPTION
```

**Fix options:**
- Add step-through logic in the MCP handler (match `completeDailyTask()`'s behavior)
- Or add `pending → completed` to the state machine
- Or update the system prompt to instruct Claude to transition `pending → in_progress` before `→ completed`

---

### #15 — MCP `update_contact`: no field whitelist

**Severity:** High — can break HubSpot bidirectional sync
**Entry point:** MCP (Cowork + Chat)
**Location:** `packages/mcp-server/src/tools/crm.ts:239-244`

**What happens:** The web UI's `updateContact()` action (`apps/web/src/lib/contacts/actions.ts:71-93`) filters updates through `ALLOWED_UPDATE_FIELDS` — a whitelist of 14 user-modifiable fields. This blocks `sync_status`, `external_ids`, and `external_updated_at`.

The MCP `update_contact` tool passes `args.updates` directly to `updateContact()` in the query layer with no filtering.

**Why it's a problem:** Claude (or a Cowork user) can set:
- `sync_status` — controls HubSpot sync state (`local`, `synced`, `conflict`, `pending_push`, `pending_pull`). Setting this incorrectly could cause the incremental sync to skip or duplicate contacts.
- `external_ids` — maps to external system IDs. Overwriting this breaks the deduplication logic in `upsertContactByEmail()`.
- `external_updated_at` — timestamp used by incremental sync to determine which records changed.

**Call chain:**
```
Claude tool call: update_contact({contact_id, updates: {sync_status: "synced", ...}})
  → updateContact(ctx, contactId, {sync_status: "synced"})  -- no filter
    → UPDATE mktg_contacts SET sync_status = 'synced'  -- bypasses sync infrastructure
```

**Fix:** Apply the same `ALLOWED_UPDATE_FIELDS` whitelist in the MCP handler, or in the shared query function itself (so all callers get the same protection).

---

### #16 — MCP `review_approval`: same task bypass as #11

**Severity:** Medium — same root cause as #11
**Entry point:** MCP (Cowork + Chat)
**Location:** `packages/mcp-server/src/tools/approvals.ts:179-191`

**What happens:** The MCP `review_approval` tool calls the same `reviewApproval()` query function → `review_approval_item()` RPC that the web UI uses. This means the same task state machine bypass and missing audit trail from finding #11 applies to MCP-initiated approval reviews.

**Fix:** Same as #11 — fix the RPC to use `transition_task_status()` instead of direct UPDATE.

---

### #17 — MCP task generation skips credit deduction

**Severity:** High — bypasses billing
**Entry point:** MCP (Cowork + Chat)
**Location:** `packages/mcp-server/src/tools/daily-tasks.ts:278-317`

**What happens:** The web UI's task generation flow (`generateDailyTasks()` → Inngest `task/decompose.manual` → `task-decomposition` function) validates credit balance and deducts `TASK_DECOMPOSITION_COST` before creating any tasks.

The MCP `generate_daily_tasks` tool only fetches context (strategy docs + yesterday's tasks). It returns this data to Claude, who then calls `create_daily_task` individually for each task. No credit check or deduction occurs at any point in this flow.

**Call chain (web UI):**
```
"Generate Tasks" button → generateDailyTasks()
  → validates credits >= TASK_DECOMPOSITION_COST
  → inngest.send("task/decompose.manual")
    → task-decomposition function → deductCredits(TASK_DECOMPOSITION_COST)
      → bulkCreateTasks()
```

**Call chain (MCP):**
```
Claude: generate_daily_tasks() → returns context (no credit check)
Claude: create_daily_task({...}) × N → each inserts directly (no per-task credit cost)
```

**Fix options:**
- Add credit validation and deduction to `create_daily_task` when `generated_by === "claude"`
- Or add a dedicated `bulk_create_tasks` MCP tool that includes credit deduction
- Or add credit deduction to the `createTaskForOrg()` query when the task is AI-generated

---

## Overlaps

### #1 — Carry-over: two implementations

**Severity:** Low — both work, but behavior could diverge
**Location:**
- `apps/web/src/lib/daily-tasks/actions.ts:226` — manual 3-step (SELECT → INSERT copies → UPDATE originals)
- `packages/queries/src/tasks.ts:213` — atomic `carry_over_tasks_v2()` RPC

**What happens:** The web UI action uses a manual 3-step approach that bypasses the `transition_task_status()` RPC for performance (batch operations). The queries package exposes the atomic RPC version, which is used by MCP tools.

**Risk:** If the state machine's valid transitions for `carried_over` change, only the RPC version will enforce them. The action's manual UPDATE would continue to set `carried_over` regardless.

---

### #2 — Task CRUD: Server Actions + API Routes

**Severity:** Informational
**Location:**
- Server actions: `apps/web/src/lib/daily-tasks/actions.ts`
- API routes: `apps/web/src/app/api/v1/tasks/route.ts`

Both paths are intentional (UI vs. external API consumers), but changes to business logic in one must be mirrored in the other.

---

### #3 — Contact CRUD: Server Actions + API Routes

**Severity:** Informational
**Same pattern as #2.** Web UI uses server actions with field whitelist; API routes use direct query calls.

---

## Gaps

### #4 — Blog webhook emission missing

**Severity:** Low
**Location:** `apps/web/src/lib/blog/actions.ts:91`

Blog publish calls `updatePost` which sets `status="published"` but does NOT emit a webhook event. No `blog.published` event type exists in `WebhookEventType` (`packages/types/src/domain.ts:941-947`). Webhook subscribers cannot be notified of new blog posts.

---

### #5 — Document text extraction: DOCX only

**Severity:** Low
**Location:** `apps/web/src/lib/documents/actions.ts:113-140`

Only DOCX files get text extracted (via mammoth). PDF, TXT, CSV, and other file types have no extraction path. The `extracted_text` column on `dtn_documents` exists but is only populated for DOCX uploads.

---

### #6 — Approval publish_config not executed

**Severity:** Low
**Location:** `dtn_approval_queue.publish_config` JSONB column

The column exists and `ReviewApprovalInput` includes it, but the `review_approval_item()` RPC does not read or act on `publish_config` after approval. Auto-publish (e.g., publishing a blog post upon approval) is not implemented.

---

### #7 — Campaign metrics aggregation missing

**Severity:** Low
**Location:** `mktg_campaigns` table

`budget`, `spend`, and `kpis` JSONB columns exist but no automated flow populates `spend` or `kpis`. These are manual-entry only. No Inngest function aggregates spend from linked tasks or outreach.

---

### #8 — Freelancer marketplace (separate repo)

**Severity:** N/A — intentional
**Note:** `mktg_freelancers`, `mktg_tasks`, `mktg_task_submissions`, `mktg_task_messages` tables exist with full schema but no dedicated UI in this repo. The freelancer marketplace will be a **separate repository**. The only bridge point is `changeTaskExecutor()` which creates a `mktg_tasks` record when switching a daily task to freelancer executor.
