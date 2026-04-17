# DoTheseNow — Knowledge Graph

> **Purpose:** Maps every user-facing and autonomous trigger through its full call chain to the database. Optimized for LLM consumption — use this to trace flows, detect data mismatches, and find missing functionality.
>
> **Format:** Each flow follows `Trigger → Action → Query → Table(s)` with data shapes at boundaries.
>
> **Markers:** `[GAP]` = missing functionality, `[MISMATCH]` = data shape inconsistency, `[OVERLAP]` = duplicate paths.
>
> Last updated: 2026-04-09

---

## 1. Schema Quick Reference

| Table | Purpose | Key FKs | Soft Delete | Vault |
|-------|---------|---------|:-----------:|:-----:|
| `dtn_organizations` | Org root, plan, credits, Stripe IDs, settings JSONB | stripe_subscription_id | | |
| `dtn_memberships` | User↔Org with role (owner/admin/member), invites | org_id, user_id | | |
| `dtn_departments` | Dept subdivision within org | org_id | | |
| `dtn_daily_tasks` | Core task management | org_id, department_id, assigned_to, created_by, campaign_id, contact_id, experiment_id, mktg_task_id | Y | |
| `dtn_task_event_log` | Task state machine audit trail | task_id, org_id | | |
| `dtn_task_decomposition` | Parent/child task relationships | parent_task_id, child_task_id | | |
| `dtn_approval_queue` | Content approval workflow | org_id, department_id, daily_task_id, assigned_reviewer | | |
| `mktg_contacts` | CRM contacts | org_id, owner_id | Y | |
| `mktg_outreach_log` | Touchpoint tracking per contact | contact_id, org_id, campaign_id | | |
| `mktg_strategy_docs` | Strategy documents with vector embeddings | org_id, previous_version_id | Y | |
| `dtn_refinement_history` | Strategy refinement iterations | strategy_doc_id, org_id | | |
| `mktg_campaigns` | Campaign grouping | org_id | | |
| `mktg_competitors` | Competitive intelligence | org_id | | |
| `mktg_insights` | Learnings and patterns | org_id | | |
| `dtn_blog_posts` | Blog content | org_id, department_id, user_id, campaign_id, task_id | | |
| `dtn_documents` | File storage metadata | org_id, uploaded_by, contact_id, campaign_id, strategy_doc_id, experiment_id | Y | |
| `dtn_chat_sessions` | Conversation threads | org_id, user_id | | |
| `dtn_chat_messages` | Individual chat messages | session_id | | |
| `dtn_experiments` | A/B test tracking | org_id, strategy_doc_id, created_by | | |
| `dtn_experiment_results` | Metric recording per experiment | experiment_id, org_id, recorded_by | | |
| `dtn_external_metrics` | GA and manual data points | org_id, experiment_id | | |
| `mktg_weekly_reviews` | Weekly retrospective summaries | org_id | | |
| `dtn_credit_ledger` | Credit audit trail | org_id | | |
| `dtn_subscriptions` | Stripe subscription sync | org_id | | |
| `dtn_stripe_events` | Stripe webhook dedup | | | |
| `dtn_mcp_oauth_clients` | OAuth 2.1 DCR registered clients | | | |
| `dtn_mcp_oauth_codes` | Short-lived auth codes (PKCE) | client_id, user_id, org_id | | |
| `dtn_mcp_oauth_tokens` | Access/refresh token pairs | client_id, user_id, org_id | | |
| `mktg_freelancers` | Contractor registry | org_id | | |
| `mktg_tasks` | Freelancer work items | org_id, assigned_to, campaign_id | | |
| `mktg_task_submissions` | Freelancer deliverables | task_id, freelancer_id, org_id | | |
| `mktg_task_messages` | Task communication | task_id, org_id | | |
| `dtn_social_credentials` | OAuth-connected social accounts | org_id | | Y |
| `dtn_org_integrations` | Integration status/config | org_id | | Y |
| `dtn_org_api_keys` | Customer API keys | org_id | | |
| `dtn_webhook_subscriptions` | Outbound webhook subscriptions | org_id | | Y |
| `dtn_hubspot_field_mappings` | Per-org HubSpot field mapping | org_id | | |
| `dtn_hubspot_events` | HubSpot webhook dedup | org_id | | |
| `dtn_sync_log` | Sync audit trail | org_id | | |
| `dtn_contact_imports` | Bulk import job tracking | org_id | | |
| `dtn_contact_external_ids` | External system IDs | contact_id, org_id | | |
| `dtn_slack_installations` | Slack workspace connections | org_id | | Y |
| `dtn_slack_events` | Slack event dedup | org_id | | |
| `dtn_slack_notification_channel` | Per-org Slack output channel | org_id | | |
| `dtn_task_result_metrics` | Per-task outcome metrics | task_id, org_id | | |

**Views:** `dtn_daily_tasks_summary`, `mktg_pipeline_summary`, `mktg_freelancer_leaderboard`

**RPCs:** `transition_task_status`, `carry_over_tasks_v2`, `get_channel_performance`, `check_and_insert_invite`, `check_and_accept_invite`, `get_user_org_ids`

---

## 2. Flows by Domain

### 2.1 Tasks

#### Create Task (Manual)

**Trigger:** TaskFormDialog → form submit
**Client:** `apps/web/src/components/daily-tasks/task-form-dialog.tsx`
**Action:** `createDailyTask(deptSlug, taskData)` → `apps/web/src/lib/daily-tasks/actions.ts:42`
**Query:** `createTaskForOrg(ctx, data)` → `packages/queries/src/tasks.ts:126`
**Tables:** `dtn_daily_tasks` INSERT
**Side effects:** `dispatchTask()` → if executor_type != "self", dispatches via Inngest
**Analytics:** `trackServerEvent("task_created", { orgId })`
**Cache:** revalidates `tasks`, `overview`

| Boundary | Fields |
|----------|--------|
| UI → Action | `title`, `description`, `task_type`, `priority`, `executor_type`, `assigned_to`, `scheduled_date` |
| Action → Query | + `department_id`, `created_by` (from auth), `assigned_to` defaults to auth.user.id, `scheduled_date` defaults to org timezone today |

**Note:** `getTasksForOrg()` department filter uses `.or(department_id.eq.X,department_id.is.null)` to include org-wide tasks (null department_id) alongside department-specific tasks. Tasks created via chat/MCP may have null department_id.
| Query → DB | + `org_id`, `status="pending"`, `generated_by="user"` (DB default) |

#### Update Task / Change Status

**Trigger:** TaskDetailSheet → button click (status change) or form edit
**Action:** `updateDailyTask(taskId, updates)` → `actions.ts:65`
**Query:** If status change → `transitionTaskStatus()` RPC; remaining fields → `updateTaskForOrg()`
**Tables:** `dtn_daily_tasks` UPDATE, `dtn_task_event_log` INSERT (via RPC)
**Emits:** `task/status.changed` Inngest event → Slack thread sync

| Boundary | Fields |
|----------|--------|
| UI → Action | `UpdateTaskInput`: title, description, task_type, priority, status, executor_type, executor_config, scheduled_date, outcome_notes, assigned_to |
| Action → RPC | `p_task_id`, `p_org_id`, `p_new_status`, `p_source="web_ui"`, `p_actor_id` |

#### Complete Task

**Trigger:** TaskDetailSheet → complete button or checkbox
**Action:** `completeDailyTask(taskId, outcomeNotes?)` → `actions.ts:128`
**Query:** Steps through `pending→in_progress→completed` via `transitionTaskStatus()` RPC
**Tables:** `dtn_daily_tasks` UPDATE, `dtn_task_event_log` INSERT (2 entries if from pending)
**Emits:** `task/status.changed`
**Analytics:** `trackServerEvent("task_completed", { orgId })`

#### Reopen Completed Task

**Trigger:** TaskList → uncheck checkbox on completed task
**Action:** `reopenDailyTask(taskId)` → `actions.ts`
**Query:** `transitionTaskStatus()` RPC → `completed → pending` (migration `20260410`)
**Tables:** `dtn_daily_tasks` UPDATE (status, completed_at=NULL), `dtn_task_events` INSERT
**Emits:** `task/status.changed`
**UI:** Task moves from "Done" section back to active list, `router.refresh()` forces re-render

#### Skip Task

**Trigger:** TaskDetailSheet → skip button
**Action:** `skipDailyTask(taskId)` → `actions.ts:178`
**Query:** `transitionTaskStatus()` → status = "skipped"

#### Carry Over Tasks

**Trigger:** TasksPageClient → "Carry Over" button
**Action:** `carryOverTasks(deptSlug, fromDate)` → `actions.ts:226`
**Query:** Direct Supabase: SELECT eligible → INSERT copies with today's date → UPDATE originals to "carried_over"
**Tables:** `dtn_daily_tasks` SELECT + INSERT + UPDATE (batch, bypasses RPC intentionally)
**Emits:** `task/status.changed` events (batch)

**Note:** Action uses direct Supabase client, not `carryOverTasks` from queries package which uses `carry_over_tasks_v2()` RPC. `[OVERLAP]` Two carry-over implementations exist — action does manual 3-step, queries package uses atomic RPC.

#### Generate Daily Tasks (AI)

**Trigger:** TasksPageClient → "Generate Tasks" button (manual only, auto-generation removed)
**Action:** `generateDailyTasks(deptSlug, date?, skipIfExists?)` → `actions.ts`
**Validates:** Active strategy doc exists, sufficient credits (`TASK_DECOMPOSITION_COST`)
**Emits:** `task/decompose.manual` Inngest event
**Inngest:** `task-decomposition` function → Claude API → `bulkCreateTasks()` → `dtn_daily_tasks` batch INSERT
**Credits:** Deducts `TASK_DECOMPOSITION_COST` from org
**Analytics:** `trackServerEvent("tasks_generated", { orgId })`

| Boundary | Fields |
|----------|--------|
| UI → Action | `deptSlug`, `date?`, `skipIfExists?` |
| Action → Inngest | `org_id`, `triggered_by`, `target_date` |
| Inngest → Claude API | strategy doc content, org context, date |
| Inngest → Query | array of `CreateTaskInput` per generated task |

#### Change Task Executor

**Trigger:** Task detail → executor dropdown
**Action:** `changeTaskExecutor(taskId, newExecutorType, marketplaceData?)` → `actions.ts:396`
**Query:** `updateTaskForOrg()` + optionally `createMarketplaceTask()` + link via `mktg_task_id`
**Tables:** `dtn_daily_tasks` UPDATE, optionally `mktg_tasks` INSERT
**Side effects:** If executor is dispatchable (claude_api/n8n/jasper_api), calls `dispatchTask()`

#### Report Task Result (MCP/API)

**Action:** `reportTaskResult(ctx, taskId, input, source, actorId)` → `packages/queries/src/tasks.ts:247`
**Tables:** `dtn_daily_tasks` UPDATE (result_metrics, outcome_notes) + auto-completes via state machine
**Side effects:** Logs outreach for `contact_ids_engaged` via `logOutreach()`

#### Task State Machine (migration 013)

**Source of truth:** `transition_task_status()` RPC in `supabase/migrations/013_task_event_log.sql:126`

| From Status | Allowed Transitions |
|-------------|---------------------|
| `pending` | `in_progress`, `waiting_approval`, `skipped`, `carried_over` |
| `in_progress` | `completed`, `failed`, `blocked`, `skipped`, `waiting_approval` |
| `waiting_approval` | `in_progress`, `completed`, `skipped`, `failed` |
| `blocked` | `in_progress`, `skipped`, `carried_over` |
| `failed` | `in_progress`, `carried_over` |
| `completed` | `pending` (reopen via migration `20260410_allow_reopen_completed_tasks`) |
| `skipped` | *(terminal)* |
| `carried_over` | *(terminal)* |

**UI Trigger → Attempted Transition Cross-Reference:**

| UI Trigger | Component | Attempted Transition | Valid? | Workaround |
|------------|-----------|---------------------|:------:|------------|
| Checkbox (check) | `task-list.tsx` | pending → completed | **No** | `completeDailyTask()` steps through `pending → in_progress → completed` |
| Checkbox (uncheck) | `task-list.tsx` | completed → pending | **Yes** | `reopenDailyTask()` uses `transitionTaskStatus()` — migration `20260410` added `completed → pending` |
| "Start" action | `task-list.tsx:131` | pending → in_progress | Yes | |
| "Skip" action | `task-list.tsx:133` | any → skipped | Partial | `skipDailyTask()` calls RPC directly; valid from pending/in_progress but not from terminal states |
| "Fail" action | `task-list.tsx:135` | any → failed | Partial | Valid from in_progress/waiting_approval but not from pending |
| Complete button | `task-detail-sheet` | in_progress → completed | Yes | |
| Carry over | `tasks-page-client` | pending/in_progress → carried_over | Yes | Bypasses RPC (batch update) |
| Executor dispatch | Inngest | pending → in_progress | Yes | |
| Agent completion | Inngest | in_progress → completed | Yes | |
| Blocker report | `blocker-dialog` | in_progress → blocked | Yes | |

---

### 2.2 Contacts

#### Create Contact

**Trigger:** ContactFormDialog → form submit
**Action:** `createContact(contactData)` → `apps/web/src/lib/contacts/actions.ts:59`
**Query:** `createContact(ctx, data)` → `packages/queries/src/contacts.ts:125`
**Tables:** `mktg_contacts` INSERT
**Analytics:** `trackServerEvent("contact_created", { orgId })`

| Boundary | Fields |
|----------|--------|
| UI → Action | `first_name` (required), `last_name`, `email`, `phone`, `company`, `title`, `contact_type`, `status`, `lifecycle_stage`, `tags`, `location`, `source`, `persona`, `notes` |
| Action → Query | + `owner_id` (from auth.user.id) |
| Query → DB | + `org_id` |

#### Update Contact

**Trigger:** ContactDetailSheet → field edit
**Action:** `updateContact(contactId, updates)` → `actions.ts:77`
**Security:** Whitelist filter — only `ALLOWED_UPDATE_FIELDS` (14 fields) pass through
**Query:** `updateContact(ctx, contactId, filtered)` → `contacts.ts:142`
**Tables:** `mktg_contacts` UPDATE

#### Search / Filter Contacts

**Trigger:** ContactsFilters → search input, dropdowns, pagination
**Action:** `searchContacts(filters)` → `actions.ts:34`
**Query:** `getContactsForOrg(ctx, filters)` → `contacts.ts:32` (paginated, 20/page default)
**Filters:** search (ilike on first_name/last_name/email/company/notes), contact_type, status, lifecycle_stage, owner_id, source, tags (GIN), not_contacted_since_days

#### Log Outreach

**Trigger:** LogOutreachDialog → form submit
**Action:** `logContactOutreach(contactId, entry)` → `actions.ts:96`
**Query:** `logOutreach(ctx, {...entry, contact_id})` → `contacts.ts:159`
**Tables:** `mktg_outreach_log` INSERT + `mktg_contacts` UPDATE (last_engaged timestamp)

| Boundary | Fields |
|----------|--------|
| UI → Action | `channel`, `direction`, `subject`, `content`, `status`, `persona_used`, `sent_at`, `campaign_id`, `notes` |
| Query → DB | + `org_id`, `contact_id`, direction defaults to "outbound" |

#### Import Contacts (CSV)

**Trigger:** ContactImportDialog → file upload + mapping + submit
**Action:** `startContactImport(input)` → `actions.ts:108`
**Query:** `createImport(adminClient, orgId, input)` → `packages/queries/src/contact-imports.ts`
**Emits:** `contacts/import.requested` Inngest event
**Analytics:** `trackServerEvent("contact_import_started", { orgId, total_rows })`
**Inngest:** `contact-csv-import` → parses CSV → `upsertContactByEmail()` per row
**Tables:** `dtn_contact_imports` INSERT, `mktg_contacts` UPSERT (batch)

---

### 2.3 Strategy

#### Create Strategy Doc

**Trigger:** Strategy page → create dialog
**Action:** `createStrategyDoc(docType, title, content, tags)` → `apps/web/src/lib/strategy/actions.ts:36`
**Query:** `createDoc(ctx, input)` → `packages/queries/src/strategy.ts`
**Tables:** `mktg_strategy_docs` INSERT (deactivates previous active doc of same type)
**Analytics:** `trackServerEvent("strategy_doc_created", { orgId, docType })`

| Boundary | Fields |
|----------|--------|
| UI → Action | `docType`, `title`, `content`, `tags[]` |
| Action → Query | + `changed_by` (auth.user.id) |
| Query → DB | + `org_id`, `version=1`, `is_active=true` |

#### Update Strategy Doc

**Trigger:** Strategy editor → save
**Action:** `updateStrategyDoc(docId, title, content, changeSummary, tags)` → `actions.ts:62`
**Query:** `updateDoc(ctx, docId, input)` → creates NEW version (INSERT), deactivates old
**Tables:** `mktg_strategy_docs` INSERT (new version) + UPDATE (old version is_active=false)

#### Delete Strategy Doc

**Trigger:** Strategy page → delete button (owner/admin only)
**Action:** `deleteStrategyDoc(docType)` → `actions.ts:56`
**Tables:** `mktg_strategy_docs` soft delete (deleted_at)

#### Get Version History

**Trigger:** Strategy page → "History" click
**Action:** `getVersionHistory(docType)` → `actions.ts:29`
**Query:** `getDocHistory(ctx, docType)` → returns id, version, change_summary, changed_by, created_at, title

---

### 2.4 Approvals

#### Get Approval Queue

**Trigger:** Approvals page load
**Action:** `getApprovalItems(deptSlug, filters)` → `apps/web/src/lib/approvals/actions.ts:23`
**Query:** `getApprovalsForOrg(ctx, filters)` → `packages/queries/src/approvals.ts`
**Tables:** `dtn_approval_queue` SELECT with joins to daily_task, reviewer_profile

#### Review Approval (Approve / Reject / Request Revision)

**Trigger:** ApprovalDetailSheet → approve/reject button
**Action:** `reviewApprovalItem(itemId, status, reviewerNotes?)` → `actions.ts:48`
**Auth:** Requires owner or admin role
**Query:** `reviewApproval(ctx, itemId, userId, input)` → `approvals.ts`
**Tables:** `dtn_approval_queue` UPDATE (status, reviewer_notes, reviewed_at)
**Side effect:** When `status = "approved"` and `item_type = "blog_post"`, auto-creates a `dtn_blog_posts` (deliverable) row from the approval content with `task_id` linked, `status = "approved"`. Revalidates `blog` cache tag.

| Boundary | Fields |
|----------|--------|
| UI → Action | `itemId`, `status` (approved/rejected/revision_requested), `reviewerNotes?` |
| Action → Query | + `reviewer_id` (auth.user.id) |

#### Approval State Machine (migration 002 + RPC 006)

**Source of truth:** `review_approval_item()` RPC — originally `006_approval_review_rpc.sql`, updated by `20260411_approval_rpc_state_machine_fixes.sql` to use `transition_task_status()` with `p_source` param for audit trail
**DB CHECK:** `status IN ('pending', 'approved', 'rejected', 'revision_requested')`

| From Status | Allowed Transitions | Enforced By |
|-------------|---------------------|-------------|
| `pending` | `approved`, `rejected`, `revision_requested` | RPC line 37: only `pending` or `revision_requested` can be reviewed |
| `revision_requested` | `approved`, `rejected`, `revision_requested` | RPC line 37 |
| `approved` | *(terminal)* | RPC rejects |
| `rejected` | *(terminal)* | RPC rejects |

**UI Trigger → Attempted Transition:**

| UI Trigger | Component | Guard | Valid? |
|------------|-----------|-------|:------:|
| Approve button | `approval-detail-sheet.tsx:46` | `isReviewable` check (line 36): only shows for `pending` or `revision_requested` | Yes |
| Reject button | `approval-detail-sheet.tsx:46` | Same `isReviewable` guard | Yes |
| Request Revision | `approval-detail-sheet.tsx:46` | Same `isReviewable` guard | Yes |
| Quick approve (card) | `approval-card.tsx:92` | `isReviewable` guard: `item.status === "pending" \|\| item.status === "revision_requested"` | Yes (fixed by migration `20260411`) |

~~**`[MISMATCH]` Approval → Task status bypass**~~ — **RESOLVED** (migration `20260411`): `review_approval_item()` RPC now calls `transition_task_status()` instead of direct UPDATEs. `waiting_approval → completed` added to state machine. All approval-driven task changes produce audit entries in `dtn_task_events` with `p_source` tracking origin (`web_ui`/`mcp`/`api`).

---

### 2.5 Blog / Deliverables

**Route:** `/[dept]/deliverables` (previously `/[dept]/blog`). UI label is "Deliverables".

#### Create Deliverable (Blog Post)

**Trigger:** DeliverableEditorDialog → form submit
**Action:** `createPost(deptSlug, input)` → `apps/web/src/lib/blog/actions.ts:26`
**Query:** `createBlogPost(ctx, data)` → `packages/queries/src/blog.ts`
**Tables:** `dtn_blog_posts` INSERT

| Boundary | Fields |
|----------|--------|
| UI → Action | `title`, `content`, `slug?`, `excerpt`, `tags[]`, `seo_title`, `seo_description`, `status`, `task_id?` |
| Action → Query | + `department_id`, `user_id` (auth), auto-generates slug from title if not provided |
| Query → DB | + `org_id` |

**Note:** `getBlogPostsForOrg` now accepts an optional `task_id` filter and joins `dtn_daily_tasks` to surface the linked task. New query function `getDeliverablesForTask(ctx, taskId)` returns all deliverables associated with a specific task.

#### Publish Deliverable (Blog Post)

**Trigger:** Deliverables list → publish button
**Action:** `publishPost(deptSlug, postId)` → calls `updatePost` with `status="published"`, `published_at=now()`

#### Delete Deliverable (Blog Post)

**Trigger:** Deliverables list → delete button
**Action:** `deletePost(deptSlug, postId)` → `deleteBlogPost(ctx, postId)` → hard delete

#### Deliverable Status Transitions (no state machine — direct updates)

**DB CHECK:** `status IN ('draft', 'review', 'approved', 'published', 'archived')`
**Enforcement:** DB CHECK constraint only — no transition validation in code. `updateBlogPost()` accepts any valid status value.

| UI Trigger | Component | Attempted Transition | Guard |
|------------|-----------|---------------------|-------|
| Create post | `deliverable-editor-dialog.tsx:45` | → `draft` (default) | None needed |
| Edit post (change status) | `deliverable-editor-dialog.tsx:92` | any → any valid status | No guard — editor allows setting any status via dropdown |
| Publish button | `deliverables-page-client.tsx:206-213` | any → `published` | Only shown when `post.status !== "published"` |
| Delete | `deliverables-page-client.tsx:215` | N/A (hard delete) | Always shown |

**Note:** No transition enforcement means `published → draft` is allowed (un-publish), which may be intentional. `archived → published` is also allowed with no review step.

---

### 2.6 Documents / Context Docs

**Route:** `/[dept]/context-docs` (previously `/[dept]/documents`). UI label is "Context Docs".

#### Upload Document

**Trigger:** DocumentUploadDialog → file select + submit (2-step: prepare + finalize)
**Action 1:** `prepareUpload(fileName, fileType, fileSize?)` → `apps/web/src/lib/documents/actions.ts:48`
  - Validates file type, checks plan limits (document count + file size)
  - Generates signed upload URL from Supabase Storage
**Action 2:** Client uploads to signed URL, then calls `finalizeUpload(input)`
**Action 3:** `finalizeUpload(input)` → `actions.ts:101`
  - `createDocument(admin, orgId, input)` → `packages/queries/src/documents.ts`
  - For DOCX files: extracts text via mammoth → stores in `extracted_text` column
**Tables:** `dtn_documents` INSERT, Supabase Storage `org-documents` bucket

#### Delete Document

**Trigger:** Document detail → delete button
**Action:** `removeDocument(documentId)` → `actions.ts:157`
**Query:** `softDeleteDocument()` (sets deleted_at) + `deleteStorageObject()` (removes from bucket)

---

### 2.7 Chat / Assistant

#### Send Chat Message

**Trigger:** ChatPanel → form submit or Enter key
**Client:** `apps/web/src/components/chat/chat-panel.tsx`
**Endpoint:** `POST /api/v1/chat` → `apps/web/src/app/api/v1/chat/route.ts`
**Tables:** `dtn_chat_sessions` INSERT (if new), `dtn_chat_messages` INSERT (user + assistant + tool_call rows), `dtn_documents` SELECT (context docs with `extracted_text` for system prompt — via `getDocumentsForAiContext`, excludes docs tagged `no-ai`)
**Credits:** Deducts 1 credit per message turn
**Analytics:** `trackServerEvent("chat_message_sent", { orgId, tokens_used, tool_calls_count })`
**Returns:** Streaming response with assistant text + tool_calls

| Boundary | Fields |
|----------|--------|
| Client → API | `message` (string), `session_id?`, `history` (previous messages array) |
| API → DB | `session_id`, `role` (user/assistant/tool_call/tool_result), `content`, `tool_name?`, `tool_input?`, `tokens_used` |

#### Load Chat History

**Trigger:** Page load (server-side in `assistant/page.tsx`) or session click in `AssistantShell`
**UI:** `AssistantShell` → `ChatHistory` sidebar (session list) + `ChatPanel` (main chat)
**Action:** `fetchChatSessions()` → `apps/web/src/lib/chat/actions.ts`
  - Returns `id, title, updated_at` from `dtn_chat_sessions` (limit 50, ordered by updated_at DESC)
**Action:** `fetchChatMessages(sessionId)` → `actions.ts`
  - Returns `ChatMessage[]` — groups tool_call rows onto preceding assistant message
**New Chat:** `AssistantShell.handleNewChat()` clears session state, remounts `ChatPanel` via `key` prop
**Session Select:** `AssistantShell.handleSelectSession()` fetches messages via `fetchChatMessages()`, passes as `initialMessages` to `ChatPanel`

---

### 2.8 Experiments & Results

#### Create Experiment

**Trigger:** ExperimentForm → form submit
**Action:** `createNewExperiment(input)` → `apps/web/src/lib/results/actions.ts:82`
**Query:** `createExperiment(ctx, input)` → `packages/queries/src/results.ts`
**Tables:** `dtn_experiments` INSERT

| Boundary | Fields |
|----------|--------|
| UI → Action | `title`, `hypothesis?`, `description?`, `strategy_doc_id?`, `strategy_section_ref?`, `success_metric?`, `success_target?`, `baseline_value?`, `planned_duration_days?` |
| Query → DB | + `org_id`, `status="backlog"`, `created_by` |

#### Record Experiment Result

**Action:** `recordExperimentResultAction(input)` → `actions.ts:105`
**Query:** `createExperimentResult(ctx, input)` → `dtn_experiment_results` INSERT

#### Log Manual Metric

**Action:** `logManualMetric(input)` → `actions.ts:124`
**Query:** `ingestMetrics(admin, orgId, [metric])` → `dtn_external_metrics` INSERT

#### Trigger Weekly Retrospective

**Action:** `triggerWeeklyRetrospective()` → `actions.ts:114`
**Emits:** `results/weekly-retrospective.org` Inngest event
**Inngest:** `weekly-retrospective` → aggregates metrics → Claude AI summary → `mktg_weekly_reviews` INSERT

#### Experiment State Machine (application-level, `packages/queries/src/results.ts:19`)

**Source of truth:** `VALID_TRANSITIONS` map in `packages/queries/src/results.ts:19-23`
**DB CHECK:** `status IN ('backlog', 'running', 'completed', 'won', 'lost')` (migration 029)

| From Status | Allowed Transitions |
|-------------|---------------------|
| `backlog` | `running` |
| `running` | `completed` |
| `completed` | `won`, `lost` |
| `won` | *(terminal)* |
| `lost` | *(terminal)* |

**UI Trigger → Attempted Transition:**

| UI Trigger | Component | Guard | Valid? |
|------------|-----------|-------|:------:|
| "Start" button | `experiment-tracker.tsx:327` | Only rendered when `exp.status === "backlog"` | Yes |
| "Complete" button | `experiment-tracker.tsx:340` | Only rendered when `exp.status === "running"` | Yes |
| "Won" button | `experiment-tracker.tsx:353` | Only rendered when `exp.status === "completed"` | Yes |
| "Lost" button | `experiment-tracker.tsx:366` | Only rendered when `exp.status === "completed"` | Yes |

**Verdict:** Well-guarded — UI conditionally renders buttons per status, and query layer validates transitions. No mismatches.

---

### 2.9 Team

#### Invite Team Member

**Trigger:** InviteDialog → form submit
**Action:** `inviteTeamMember(email, role)` → `apps/web/src/lib/team/actions.ts:17`
**Auth:** Requires owner or admin
**Query:** `check_and_insert_invite` RPC (atomic plan limit enforcement)
**Tables:** `dtn_memberships` INSERT (user_id=NULL, invited_email set)

#### Accept Invite

**Trigger:** Invites page → accept button
**Action:** `acceptInvite(membershipId)` → `actions.ts:51`
**Query:** `check_and_accept_invite` RPC (verifies email match, re-checks plan limit)
**Tables:** `dtn_memberships` UPDATE (user_id set, accepted_at set)

#### Remove Member

**Trigger:** Team settings → remove button
**Action:** `removeMember(membershipId)` → `actions.ts:105`
**Auth:** Owner/admin. Cannot remove last owner. Admins cannot remove owners.
**Tables:** `dtn_memberships` UPDATE (is_active=false) — soft deactivation

#### Update Role

**Trigger:** Team settings → role dropdown
**Action:** `updateMemberRole(membershipId, newRole)` → `actions.ts:157`
**Auth:** Owner only. Cannot change last owner's role.
**Tables:** `dtn_memberships` UPDATE (role)

#### Switch Org

**Trigger:** OrgSwitcher dropdown → org click
**Action:** `switchOrg(orgId)` → `actions.ts:258`
**Validates:** Active membership exists via `getMembershipByUserId()`
**Effect:** Sets `dtn_active_org` httpOnly cookie → revalidates `/`

---

### 2.10 Billing / Credits

#### Fetch Credit Balance

**Action:** `fetchCreditBalance()` → `apps/web/src/lib/credits/actions.ts:24`
**Query:** `getCreditBalance(ctx)` → `packages/queries/src/credits.ts`
**Tables:** `dtn_organizations` SELECT (ai_credits_remaining)

#### Get Credit Usage (Billing Page)

**Action:** `getCreditUsage()` → `actions.ts:50`
**Query:** `getCreditBalance()` + `getCreditHistory(ctx, {limit: 10})`
**Tables:** `dtn_organizations` SELECT + `dtn_credit_ledger` SELECT

#### Stripe Checkout (Plan Upgrade)

**Trigger:** Billing page → upgrade button
**Action:** Creates Stripe checkout session → redirects to Stripe
**Webhook:** `POST /api/webhooks/stripe` → processes subscription events
**Tables:** `dtn_subscriptions` UPSERT, `dtn_stripe_events` INSERT (dedup), `dtn_organizations` UPDATE (plan, credits)
**Analytics:** `trackServerEvent("subscription_created"/"subscription_canceled")` — distinctId resolved via `dtn_memberships` owner lookup (webhooks have no user session)

---

### 2.11 Integrations

#### Connect Integration (Generic)

**Trigger:** IntegrationCard → connect button + config form
**Action:** `connectIntegration(executorType, config)` → `apps/web/src/lib/integrations/actions.ts:25`
**Auth:** Owner/admin
**Flow:** Test connection → delete old Vault secret → store new secret → upsert integration
**Tables:** `dtn_org_integrations` UPSERT, Supabase Vault (secret storage)

#### Connect Slack (OAuth)

**Trigger:** SlackIntegrationCard → "Connect Slack" button
**Action:** `initiateSlackOAuth()` → `actions.ts:140`
**Flow:** Set CSRF state cookie → redirect to Slack authorize URL
**Callback:** `POST /api/slack/oauth` → exchange code → store tokens in Vault
**Tables:** `dtn_slack_installations` INSERT, `dtn_org_integrations` UPSERT

#### Connect HubSpot (OAuth)

**Trigger:** HubSpotIntegrationCard → "Connect HubSpot" button
**Action:** `initiateHubSpotOAuth()` → `actions.ts:165`
**Callback:** `POST /api/hubspot/oauth` → exchange code → store tokens → trigger initial sync
**Tables:** `dtn_org_integrations` UPSERT, triggers `hubspot/initial-sync` Inngest event

#### Disconnect Integration

**Action:** `disconnectIntegration(executorType)` → `actions.ts:101`
**Flow:** Delete Vault secret → deactivate `dtn_org_integrations` record
**Specific cleanups:**
  - Slack: also deletes `dtn_slack_installations`
  - HubSpot: also deletes `dtn_hubspot_field_mappings`

---

## 3. Autonomous / Scheduled Flows

### Inngest Cron Functions

| Function | Schedule | Description | Tables Touched |
|----------|----------|-------------|----------------|
| `daily-task-generation` | `0 * * * *` (hourly) | Finds orgs at local 7am, emits `task/daily.generate` | `dtn_organizations`, `dtn_daily_tasks`, `dtn_credit_ledger` |
| `slackMorningDMCron` | `0 * * * *` (hourly, fires at org's 7am) | Sends morning task digest via Slack DM | `dtn_daily_tasks`, `dtn_slack_installations` |
| `weeklyRetrospectiveCron` | `0 17 * * 5` (Fri 5pm) | Emits `review/weekly` event | `mktg_weekly_reviews`, `dtn_external_metrics` |
| `strategyRefinementCron` | `0 0 * * 1` (Mon midnight) | Triggers strategy refinement | `mktg_strategy_docs`, `dtn_refinement_history` |
| `hubspotIncrementalSyncCron` | `0 6 * * *` (6am daily) | Syncs HubSpot contact changes | `mktg_contacts`, `dtn_contact_external_ids`, `dtn_sync_log` |
| `googleAnalyticsSyncCron` | `0 8 * * *` (8am daily) | Fetches GA metrics | `dtn_external_metrics`, `dtn_sync_log` |
| `metricsWeeklyAggregatorCron` | `0 9 * * 1` (Mon 9am) | Aggregates weekly metrics | `dtn_external_metrics`, `mktg_weekly_reviews` |
| `overdue-tasks` | (cron) | Checks for overdue tasks, notifies | `dtn_daily_tasks` |
| `daily-maintenance-cleanup` | (cron) | Archives old soft-deleted records | Multiple tables |

### Inngest Event-Driven Functions

| Function | Event | Description | Tables Touched |
|----------|-------|-------------|----------------|
| `task-decomposition` | `task/decompose.manual`, `task/daily.generate` | AI task breakdown from strategy | `dtn_daily_tasks` (bulk INSERT), `dtn_credit_ledger` |
| `executor-dispatch` | `daily-task/dispatch` | Routes to n8n/Claude/Slack executor | `dtn_daily_tasks` UPDATE |
| `agent-executor` | `task/execute-agent` | Multi-turn Claude agent for complex tasks | `dtn_daily_tasks` UPDATE |
| `strategy-generation` | `strategy/generate` | AI strategy creation with embeddings | `mktg_strategy_docs` INSERT |
| `strategy-refinement` | `strategy/refine` | Iterative strategy refinement | `mktg_strategy_docs`, `dtn_refinement_history` |
| `blocker-resolution` | `blocker/reported` | Classifies and resolves blockers | blocker tables |
| `contact-csv-import` | `contacts/import.requested` | Parses CSV, batch upserts contacts | `dtn_contact_imports` UPDATE, `mktg_contacts` UPSERT |
| `webhook-delivery` | `webhook/send` | HMAC-signed delivery to subscribers | `dtn_webhook_subscriptions` UPDATE |
| `weekly-retrospective` | `results/weekly-retrospective.org` | AI-generated weekly summary | `mktg_weekly_reviews` INSERT |
| `task-batch-notifications` | `batch/slack-notify`, `batch/email-notify` | Batched task update notifications | Read-only |

### Inngest Slack Functions

| Function | Event | Description |
|----------|-------|-------------|
| `slack-event-handler` | `slack/mention.received`, `slack/command.received` | Processes @bot mentions and slash commands |
| `slack-thread-sync` | `task/status.changed` | Bidirectional: updates Slack thread when task status changes |
| `slack-eod-summary` | `task/completed` | Posts end-of-day completed tasks summary |
| `slack-morning-dm` | `slack/morning-dm` | Personalized morning digest via DM |

### Inngest HubSpot Functions

| Function | Event | Description |
|----------|-------|-------------|
| `hubspot-initial-sync` | `hubspot/oauth-complete` | Full contact sync on first connect |
| `hubspot-incremental-sync` | `hubspot/incremental-sync` | Delta sync of changed contacts |
| `hubspot-outbound-sync` | `contact/updated` | Pushes contact changes to HubSpot |
| `hubspot-webhook-handler` | `hubspot/webhook-received` | Processes inbound HubSpot webhooks |
| `google-analytics-sync` | `google-analytics/sync` | Fetches GA metrics |

---

## 4. MCP Tools (Cowork / Chat)

All 24 MCP tools are available via two entry points:
- **`POST /api/mcp`** — Cowork desktop plugin (MCP protocol, org from env `ORG_ID`)
- **`POST /api/v1/chat`** — Dashboard chat (agentic loop, org from session cookie, `handleToolForOrg()` at `route.ts:322`)

Both paths call the **same handlers** in `packages/mcp-server/src/tools/`. Claude picks which tools to call — there is no UI guard.

### MCP Tool Inventory

| Tool | Module | Query Function | Tables | State Machine? |
|------|--------|----------------|--------|:--------------:|
| `get_daily_tasks` | `daily-tasks.ts` | `getTasksForOrg()` | `dtn_daily_tasks` SELECT | |
| `create_daily_task` | `daily-tasks.ts` | `createTaskForOrg()` | `dtn_daily_tasks` INSERT | |
| `update_daily_task` | `daily-tasks.ts` | `transitionTaskStatus()` + `updateTaskForOrg()` | `dtn_daily_tasks`, `dtn_task_event_log` | **Yes** — task SM |
| `generate_daily_tasks` | `daily-tasks.ts` | `getStrategyDocs()` + `getTasksForOrg()` | READ only | |
| `carry_over_tasks` | `daily-tasks.ts` | `carryOverTasks()` RPC | `dtn_daily_tasks` | **Yes** — atomic RPC |
| `report_task_result` | `daily-tasks.ts` | `reportTaskResult()` | `dtn_daily_tasks`, `mktg_outreach_log` | **Yes** — auto-completes |
| `get_task_context` | `daily-tasks.ts` | `getTaskContext()` | `dtn_daily_tasks`, `mktg_strategy_docs`, `mktg_campaigns`, `mktg_contacts`, `mktg_outreach_log` | |
| `submit_for_approval` | `approvals.ts` | `createApproval()` + `transitionTaskStatus()` | `dtn_approval_queue` INSERT, `dtn_daily_tasks` UPDATE | **Yes** — task SM |
| `list_pending_approvals` | `approvals.ts` | `getApprovalsForOrg()` | `dtn_approval_queue` SELECT | |
| `review_approval` | `approvals.ts` | `reviewApproval()` | `dtn_approval_queue`, `dtn_daily_tasks` | **Yes** — approval SM + task bypass |
| `search_contacts` | `crm.ts` | `getContactsForOrg()` | `mktg_contacts` SELECT | |
| `add_contact` | `crm.ts` | `createContact()` | `mktg_contacts` INSERT | |
| `update_contact` | `crm.ts` | `updateContact()` | `mktg_contacts` UPDATE | |
| `log_outreach` | `crm.ts` | `logOutreach()` | `mktg_outreach_log` INSERT, `mktg_contacts` UPDATE | |
| `get_outreach_history` | `crm.ts` | `getOutreachHistory()` | `mktg_outreach_log` SELECT | |
| `get_pipeline_summary` | `crm.ts` | `getPipelineSummary()` | `mktg_pipeline_summary` view | |
| `update_outreach` | `crm.ts` | `updateOutreach()` | `mktg_outreach_log` UPDATE, `mktg_contacts` UPDATE | |
| `get_strategy_doc` | `strategy.ts` | `getStrategyDocs()` | `mktg_strategy_docs` SELECT | |
| `update_strategy_doc` | `strategy.ts` | `createDocDirect()` | `mktg_strategy_docs` INSERT (version) | |
| `search_strategy` | `strategy.ts` | `searchStrategyDocs()` | `mktg_strategy_docs` (vector) | |
| `get_competitors` | `strategy.ts` | `getCompetitorsForOrg()` | `mktg_competitors` SELECT | |
| `update_competitor` | `strategy.ts` | `upsertCompetitor()` | `mktg_competitors` UPSERT | |
| `log_insight` | `strategy.ts` | `createInsight()` | `mktg_insights` INSERT | |
| `create_campaign` | `campaigns.ts` | `createCampaign()` | `mktg_campaigns` INSERT | |
| `create_weekly_review` | `campaigns.ts` | `createWeeklyReview()` | `mktg_weekly_reviews` INSERT | |

*Marketplace tools (5) also registered: `create_task`, `list_tasks`, `review_submission`, `get_freelancer_leaderboard`, `send_task_message` — for separate marketplace repo.*

### MCP × State Machine Cross-Reference

| MCP Tool | Attempted Transition | Validation | Issues |
|----------|---------------------|------------|--------|
| `update_daily_task` (status field) | Any → any (caller chooses) | `transitionTaskStatus()` RPC validates; `completeTaskViaStateMachine()` for completion | ~~`[MISMATCH]`~~ **RESOLVED** — uses shared `completeTaskViaStateMachine()` helper for step-through. Direct transition for `waiting_approval → completed`. |
| `report_task_result` | Non-terminal → `completed` | `reportTaskResult()` calls `transitionTaskStatus()` inside a try/catch — warns but doesn't throw if transition fails | Soft failure — task stays in current status, metrics still saved |
| `submit_for_approval` | Task → `waiting_approval` | `transitionTaskStatus()` via MCP source. Throws if task isn't in `pending` or `in_progress` | Valid — but error message is verbose (includes approval ID) |
| `review_approval` | Approval: pending/revision_requested → approved/rejected/revision_requested | `review_approval_item()` RPC validates from-status | ~~`[MISMATCH]`~~ **RESOLVED** — RPC now uses `transition_task_status()` with `p_source = 'mcp'`. Full audit trail. |
| `carry_over_tasks` | pending/in_progress → `carried_over` | `carry_over_tasks_v2()` RPC (atomic) | Clean — uses the queries package RPC, not the action's manual 3-step |
| `update_contact` | No state machine — accepts any valid updates | DB CHECK on status/lifecycle_stage; `ALLOWED_CONTACT_UPDATE_FIELDS` whitelist | ~~`[MISMATCH]`~~ **RESOLVED** — MCP tool now imports shared `ALLOWED_CONTACT_UPDATE_FIELDS` from `@dothesenow/queries` and filters updates. |

### Key MCP-Specific Risks

1. ~~**No credit deduction for task generation context**~~ — **PARTIALLY RESOLVED**: `generate_daily_tasks` MCP tool now checks credit balance and returns an error if insufficient. Credits are NOT deducted in this tool (it only gathers context). Deduction happens in the Inngest `task-decomposition` function after actual AI work. The MCP path validates balance but relies on the Inngest pipeline for actual billing.

2. **Chat history injection** — `POST /api/v1/chat` accepts a `history` array from the client. History messages are capped at 20 entries / 4000 chars per message, but content is not sanitized. The system prompt includes tool definitions, and Claude executes tool calls based on conversation context.

3. **No rate limit on tool calls per session** — The chat route caps at `MAX_TOOL_CALLS_PER_TURN = 5` per message, but there's no per-session or per-day cap. A user could send many messages to trigger unlimited tool calls.

---

## 5. Integration Points (External)

### Slack

| Direction | Route/Function | Tables |
|-----------|----------------|--------|
| **Inbound** | `POST /api/slack/events` | `dtn_slack_events` (dedup) |
| **Inbound** | `POST /api/slack/interactions` | dispatches handlers |
| **Inbound** | `POST /api/slack/commands` | dispatches handlers |
| **OAuth** | `POST /api/slack/oauth` | `dtn_slack_installations`, `dtn_org_integrations` |
| **Outbound** | Slack SDK (DMs, threads) | reads `dtn_slack_installations` |

### HubSpot

| Direction | Route/Function | Tables |
|-----------|----------------|--------|
| **Inbound** | `POST /api/webhooks/hubspot` | `dtn_hubspot_events` (dedup), `mktg_contacts`, `dtn_contact_external_ids` |
| **OAuth** | `POST /api/hubspot/oauth` | `dtn_org_integrations` |
| **Outbound** | HubSpot API SDK | `mktg_contacts`, `dtn_hubspot_field_mappings`, `dtn_sync_log` |

### Stripe

| Direction | Route/Function | Tables |
|-----------|----------------|--------|
| **Inbound** | `POST /api/webhooks/stripe` | `dtn_stripe_events` (dedup), `dtn_subscriptions`, `dtn_organizations` |
| **Outbound** | Stripe SDK | checkout sessions, portal sessions |

### Google Analytics

| Direction | Function | Tables |
|-----------|----------|--------|
| **OAuth** | `POST /api/google-analytics/oauth` | `dtn_org_integrations` |
| **Outbound** | GA API (via Inngest) | `dtn_external_metrics`, `dtn_sync_log` |

### N8N

| Direction | Route/Function | Tables |
|-----------|----------------|--------|
| **Inbound** | `POST /api/webhooks/n8n` | `dtn_daily_tasks` UPDATE (task results) |
| **Outbound** | HTTP webhook triggers (via executor dispatch) | reads `dtn_daily_tasks` |

### MCP / Cowork Desktop

| Direction | Route | Tables |
|-----------|-------|--------|
| **Inbound** | `POST /api/mcp` | All org-scoped tables (24 tools) |

### PostHog (Product Analytics)

| Direction | Component/File | Purpose |
|-----------|----------------|---------|
| **Client init** | `AnalyticsProvider` → `apps/web/src/components/providers/analytics-provider.tsx` | Wraps root layout, initializes `posthog-js`, captures `$pageview` on route change |
| **Client identify** | `IdentifyUser` → `apps/web/src/components/providers/identify-user.tsx` | Calls `posthog.identify()` + `posthog.group("org")` in dashboard layout |
| **Server tracking** | `trackServerEvent()` → `apps/web/src/lib/analytics.ts` | Uses `posthog-node` with `flushAt:1` for server actions and API routes |
| **Outbound** | `https://us.i.posthog.com` (default, configurable via `NEXT_PUBLIC_POSTHOG_HOST`) | Event ingestion |

### Sentry (Error Tracking)

| Component | File | Purpose |
|-----------|------|---------|
| **Client config** | `apps/web/sentry.client.config.ts` | Browser error capture, 10% trace sampling, replay on error |
| **Server config** | `apps/web/sentry.server.config.ts` | Node.js error capture, 10% trace sampling |
| **Edge config** | `apps/web/sentry.edge.config.ts` | Edge runtime error capture |
| **Instrumentation** | `apps/web/instrumentation.ts` | Next.js instrumentation hook, loads server/edge configs |
| **Global error** | `apps/web/src/app/global-error.tsx` | Root error boundary, `Sentry.captureException` |
| **Error boundaries** | All `error.tsx` files + `ErrorBoundary` component | `Sentry.captureException` in `useEffect`/`componentDidCatch` |

### Tracked Events Catalog

| Event | Source File | distinctId | Properties |
|-------|------------|------------|------------|
| `$pageview` | `analytics-provider.tsx` | browser session | `$current_url` |
| `chat_message_sent` | `api/v1/chat/route.ts` | userId | `orgId`, `tokens_used`, `tool_calls_count` |
| `subscription_created` | `api/webhooks/stripe/route.ts` | owner userId (membership lookup) | `plan`, `customerId`, `orgId` |
| `subscription_canceled` | `api/webhooks/stripe/route.ts` | owner userId (membership lookup) | `subscriptionId`, `orgId` |
| `contact_created` | `contacts/actions.ts` | userId | `orgId` |
| `contact_import_started` | `contacts/actions.ts` | userId | `orgId`, `total_rows` |
| `task_created` | `daily-tasks/actions.ts` | userId | `orgId` |
| `task_completed` | `daily-tasks/actions.ts` | userId | `orgId` |
| `tasks_generated` | `daily-tasks/actions.ts` | userId | `orgId` |
| `strategy_doc_created` | `strategy/actions.ts` | userId | `orgId`, `docType` |

---

## 6. Cross-Cutting Concerns

### Authentication

**Flow:** Email → `signInWithOtp()` → magic link → `/callback` → session cookie → `/`
**Post-login handoff at `/`:** `apps/web/src/app/page.tsx` branches via `getAuthenticatedMembership()`: authenticated + onboarded → `redirect(/${dept})` (first active dept slug, cached); authenticated but no onboarding / no membership → `/onboarding`; unauthenticated → marketing `LandingPage`. `redirect()` calls live OUTSIDE the auth try/catch so Next.js `NEXT_REDIRECT` exceptions aren't swallowed.
**Clients:**
- Browser: `createClient()` → `apps/web/src/lib/supabase/client.ts`
- Server: `createClient()` → `apps/web/src/lib/supabase/server.ts` (cookie-based)
- Admin: `createAdminClient()` → `apps/web/src/lib/supabase/admin.ts` (service role, bypasses RLS)

**Auth Helpers:**
- `getAuthenticatedMembership(roles?)` → returns user + org + membership
- `getAuthenticatedOrgContext(roles?)` → returns `{ auth, ctx: OrgContext }`

**Active Org:** `dtn_active_org` httpOnly cookie, resolved by middleware

### Credit System

- **Balance:** `dtn_organizations.ai_credits_remaining` (int)
- **Ledger:** `dtn_credit_ledger` (audit trail with balance_after)
- **Costs:** Task decomposition = `TASK_DECOMPOSITION_COST`, Chat = 1 credit/turn
- **Plan limits:** Free=0, Starter=50, Growth=200, Team=500, Enterprise=-1 (unlimited)
- **Reset:** Per billing period via `ai_credits_reset_at`
- **Client context:** `useCredits()` from `apps/web/src/contexts/credits-context.tsx`

### RLS Pattern

- Service role: `FOR ALL` (full access)
- Authenticated: filtered by `get_user_org_ids()` RPC → returns array of org IDs
- Soft-deleted tables: SELECT policy excludes `deleted_at IS NOT NULL`

### Realtime Subscriptions

**Component:** `RealtimeListener` → `apps/web/src/components/realtime-listener.tsx`
**Pattern:** `supabase.channel().on("postgres_changes")` filtered by `org_id`
**Tables monitored:** `dtn_daily_tasks`, `mktg_contacts`, `dtn_chat_messages`, `dtn_approval_queue`, `mktg_strategy_docs`
**Effect:** Debounced (500ms) `router.refresh()` → RSC re-render

### Webhook Delivery (Outbound)

**Tables:** `dtn_webhook_subscriptions` (registration) → Inngest `webhook/send` event → HMAC-signed delivery
**Event types:** `task.created`, `task.status_changed`, `experiment.completed`, `strategy.refined`, `contact.created`, `contact.updated`

### Cache Strategy

- Server components use `unstable_cache()` with tags: `tasks`, `contacts`, `overview`, `strategy`, `approvals`, `blog`, `documents`, `results`, `invites`
- Mutations call `revalidateTag(tag, "max")` to invalidate
- Realtime subscriptions also trigger `router.refresh()`

### Other State Machines

#### Contact Import Status (migration 033/039)

**DB CHECK:** `status IN ('pending', 'processing', 'completed', 'failed', 'partial', 'cancelled')`
**Enforcement:** Application-level only — no RPC, direct updates via `updateImportProgress()`.

| From Status | Transitions | Triggered By |
|-------------|-------------|--------------|
| `pending` | `processing` | Inngest `contact-csv-import` on pickup |
| `processing` | `completed`, `failed`, `partial`, `cancelled` | Inngest on finish / `cancelContactImport()` action |
| `completed` | *(terminal)* | |
| `failed` | *(terminal)* | |
| `partial` | *(terminal)* | |
| `cancelled` | *(terminal)* | |

**UI Trigger → Attempted Transition:**

| UI Trigger | Component | Guard | Valid? |
|------------|-----------|-------|:------:|
| Cancel button | `import-progress-banner.tsx:139` | Only shown when `isActive` (pending/processing) | Yes |
| Cancel action | `contacts/actions.ts:144` | Validates `status !== "processing" && status !== "pending"` throws | Yes |

**Note:** Cancel action at `actions.ts:150` checks status before updating but uses `!==` logic — it rejects if status is NOT processing/pending, which is correct. No mismatches.

#### Blocker Resolution Status (migration 023)

**DB CHECK:** `resolution_status IN ('reported', 'classifying', 'classified', 'resolving', 'resolved', 'escalated', 'dismissed', 'failed')`
**Enforcement:** No formal state machine — Inngest functions update status sequentially, UI actions jump to terminal states.

| From Status | Transitions | Triggered By |
|-------------|-------------|--------------|
| `reported` | `classifying` | Inngest `blocker-resolution` step 1 |
| `classifying` | `classified`, `reported` (on error fallback) | Inngest classification step |
| `classified` | `resolving` | Inngest resolution step |
| `resolving` | `resolved`, `escalated`, `failed` | Inngest resolution/escalation |
| `resolved` | *(terminal)* | Inngest or UI |
| `escalated` | `resolved`, `dismissed` | UI or Inngest re-attempt |
| `dismissed` | *(terminal)* | UI only |
| `failed` | *(terminal)* | Inngest |

**UI Trigger → Attempted Transition:**

| UI Trigger | Component | Guard | Valid? |
|------------|-----------|-------|:------:|
| Dismiss button | `task-detail-sheet.tsx:125` | No from-status guard in UI | `[MISMATCH]` `dismissBlocker()` action does not check current resolution_status — can dismiss an already-resolved blocker, though the direct UPDATE won't fail (no CHECK on transitions) |
| Resolve manually | `task-detail-sheet.tsx:138` | No from-status guard in UI | Same — `resolveBlockerManually()` doesn't validate current status |

**Side effect:** Both `dismissBlocker()` and `resolveBlockerManually()` call `transitionTaskStatus(blocker.task_id, "in_progress")` to unblock the task. If the blocker is already resolved/dismissed and the task has moved to a terminal state, this will throw from the task state machine.

#### Marketplace Task Status (migration 001 — separate repo)

**DB CHECK:** `status IN ('draft', 'open', 'claimed', 'in_progress', 'review', 'revision', 'completed', 'cancelled')`
**Note:** No UI in this repo. Marketplace will be a separate repository. Listed for completeness of DB state.

Expected flow: `draft → open → claimed → in_progress → review → [completed | revision → review] | cancelled`

#### Submission Status (migration 001 — separate repo)

**DB CHECK:** `status IN ('submitted', 'under_review', 'approved', 'revision_requested', 'rejected')`
**Query-level enforcement:** `review_marketplace_submission` RPC (migration 015) validates transitions.

#### Refinement Run Status (migration 030)

**DB CHECK:** `status IN ('pending', 'running', 'completed', 'failed', 'skipped')`
**Enforcement:** Inngest `strategy-refinement` function manages transitions. No UI directly modifies status.

---

## 7. API Routes Reference

### Public API (v1) — Session Auth

| Method | Route | Action | Tables |
|--------|-------|--------|--------|
| GET | `/api/v1/tasks` | List tasks | `dtn_daily_tasks` |
| POST | `/api/v1/tasks` | Create task | `dtn_daily_tasks` |
| GET | `/api/v1/tasks/[id]` | Get task | `dtn_daily_tasks` |
| PATCH | `/api/v1/tasks/[id]` | Update task | `dtn_daily_tasks` |
| GET | `/api/v1/contacts` | List contacts | `mktg_contacts` |
| POST | `/api/v1/contacts` | Create contact | `mktg_contacts` |
| GET | `/api/v1/contacts/[id]` | Get contact | `mktg_contacts` |
| PATCH | `/api/v1/contacts/[id]` | Update contact | `mktg_contacts` |
| POST | `/api/v1/chat` | Send chat message | `dtn_chat_sessions`, `dtn_chat_messages` |
| GET | `/api/v1/experiments` | List experiments | `dtn_experiments` |
| POST | `/api/v1/experiments` | Create experiment | `dtn_experiments` |
| GET | `/api/v1/experiments/[id]` | Get experiment | `dtn_experiments` |
| PATCH | `/api/v1/experiments/[id]` | Update experiment | `dtn_experiments` |
| GET | `/api/v1/experiments/[id]/results` | Get results | `dtn_experiment_results` |
| POST | `/api/v1/experiments/[id]/results` | Record result | `dtn_experiment_results` |
| GET | `/api/v1/metrics` | Get metrics | `dtn_external_metrics` |
| POST | `/api/v1/metrics` | Log metric | `dtn_external_metrics` |
| GET | `/api/v1/webhooks` | List subscriptions | `dtn_webhook_subscriptions` |
| POST | `/api/v1/webhooks/subscribe` | Create subscription | `dtn_webhook_subscriptions` |
| GET | `/api/v1/webhooks/[id]` | Get subscription | `dtn_webhook_subscriptions` |
| DELETE | `/api/v1/webhooks/[id]` | Delete subscription | `dtn_webhook_subscriptions` |
| POST | `/api/v1/webhooks/test/[id]` | Test webhook | `dtn_webhook_subscriptions` |

### MCP OAuth 2.1 Routes

| Method | Route | Purpose | Tables |
|--------|-------|---------|--------|
| GET | `/.well-known/oauth-authorization-server` | OAuth server metadata discovery | — |
| GET | `/.well-known/oauth-protected-resource` | Protected resource metadata | — |
| GET | `/api/mcp/oauth/authorize` | Start auth code flow (redirects to consent UI) | `dtn_mcp_oauth_clients` |
| POST | `/api/mcp/oauth/register` | Dynamic Client Registration (RFC 7591) | `dtn_mcp_oauth_clients` |
| POST | `/api/mcp/oauth/token` | Token exchange (auth code → tokens, refresh) | `dtn_mcp_oauth_codes`, `dtn_mcp_oauth_tokens` |
| — | `/oauth/authorize` (page) | User consent UI for OAuth grants | `dtn_mcp_oauth_codes` |

### Internal Routes

| Route | Purpose |
|-------|---------|
| `POST /api/inngest` | Inngest SDK handler |
| `POST /api/mcp` | MCP protocol handler (session auth + Bearer token) |
| `POST /api/executors/claude` | Claude API task executor |
| `GET /api/dev/login` | Dev-only auto-login bypass |

---

## 8. Gap Registry

> Discovered issues and inconsistencies. Update this section when new gaps are found.

### Overlaps

1. **`[OVERLAP]` Carry-over: two implementations** — `carryOverTasks()` in `actions.ts:226` does manual 3-step (SELECT→INSERT→UPDATE) bypassing the state machine RPC. `carryOverTasks()` in `packages/queries/src/tasks.ts:213` uses atomic `carry_over_tasks_v2()` RPC. The action's approach was chosen for batch performance, but they could diverge in behavior. The queries version is used by MCP tools.

2. **`[OVERLAP]` Task CRUD: Server Actions + API Routes** — Tasks can be created/updated via both server actions (`lib/daily-tasks/actions.ts`) and API routes (`/api/v1/tasks/`). Both are intentional (UI vs API consumers) but changes to one must be mirrored in the other.

3. **`[OVERLAP]` Contact CRUD: Server Actions + API Routes** — Same pattern as tasks. Both paths must stay in sync.

### Potential Gaps

4. **`[GAP]` Deliverable webhook emission** — Deliverable publish (`blog/actions.ts:91`) calls `updatePost` which updates status but does NOT emit a webhook event. No `deliverable.published` event type exists in `WebhookEventType`. Subscribers cannot be notified of new deliverables.

5. **`[GAP]` Document text extraction** — Only DOCX files get text extracted (`documents/actions.ts:113`). PDF, TXT, and other file types have no extraction path. The `extracted_text` column exists but is only populated for DOCX.

6. **`[GAP]` Approval publish_config execution** — `dtn_approval_queue.publish_config` JSONB column exists and `ReviewApprovalInput` includes it, but the actual publish execution after approval (e.g., auto-publish a deliverable) is not visible in the approval actions — may be handled in the query layer's RPC.

7. **`[GAP]` Campaign metrics aggregation** — `mktg_campaigns` has `budget`, `spend`, and `kpis` JSONB columns but no automated flow populates `spend` or `kpis`. These appear to be manual-entry only.

8. **Freelancer marketplace** — `mktg_freelancers`, `mktg_tasks`, `mktg_task_submissions`, `mktg_task_messages` tables exist with full schema but no dedicated UI in this repo. This is intentional — the freelancer marketplace will be a **separate repository**. The only bridge point in this repo is `changeTaskExecutor()` which creates a `mktg_tasks` record when switching a daily task to freelancer executor.

### State Machine Mismatches

9. ~~**`[MISMATCH]` Checkbox uncheck: completed → pending**~~ — **RESOLVED** (migration `20260410`): Added `completed → pending` to state machine RPC (both 5-arg and 6-arg versions). `reopenDailyTask()` action uses `transitionTaskStatus()` with full audit trail.

10. ~~**`[MISMATCH]` "Fail" action from pending**~~ — **RESOLVED**: "Mark Failed" dropdown item now only renders when `task.status === "in_progress" || task.status === "waiting_approval"`. Pending tasks show "Skip" but not "Fail".

11. ~~**`[MISMATCH]` Approval RPC bypasses task state machine**~~ — **RESOLVED** (migration `20260411`): `review_approval_item()` RPC replaced to call `transition_task_status()` with `p_source` param. `waiting_approval → completed` added to state machine. All three approval outcomes now produce audit entries in `dtn_task_events`.

12. ~~**`[MISMATCH]` Approval card: no from-status guard**~~ — **RESOLVED**: `approval-card.tsx:92` now guards with `item.status === "pending" || item.status === "revision_requested"`.

13. ~~**`[MISMATCH]` Blocker dismiss/resolve: no status guard**~~ — **RESOLVED**: Both functions use atomic conditional update (`WHERE resolution_status NOT IN ('resolved', 'dismissed')`). Returns `{ status: "already_resolved" }` if beaten by another actor. Task transition only fires if `task.status === "blocked"`.

### MCP / Chat Entry Point Mismatches

14. ~~**`[MISMATCH]` MCP `update_daily_task`: no step-through for pending → completed**~~ — **RESOLVED**: MCP tool now uses shared `completeTaskViaStateMachine()` helper from `@dothesenow/queries`. Auto-steps through `in_progress` for non-`in_progress`/`waiting_approval` statuses. Direct `waiting_approval → completed` transition supported.

15. ~~**`[MISMATCH]` MCP `update_contact`: no field whitelist**~~ — **RESOLVED**: MCP tool imports shared `ALLOWED_CONTACT_UPDATE_FIELDS` from `@dothesenow/queries` and filters updates. System fields (`sync_status`, `external_ids`, etc.) are blocked.

16. ~~**`[MISMATCH]` MCP `review_approval`: same task state machine bypass as UI (#11)**~~ — **RESOLVED** (same fix as #11): RPC now uses `transition_task_status()` with `p_source = 'mcp'`.

17. ~~**`[GAP]` MCP task generation skips credit deduction**~~ — **PARTIALLY RESOLVED**: `generate_daily_tasks` MCP tool now checks `getCreditBalance()` and returns error if insufficient. Credits are NOT deducted in this context-gathering tool — deduction happens in the Inngest pipeline after actual AI work, matching web UI flow.

### Observability & Analytics

18. ~~**`[GAP]` No error tracking or product analytics**~~ — **RESOLVED** (Phase 1 Observability): Sentry error tracking instrumented across all error boundaries (`global-error.tsx`, 5 route `error.tsx` files, `ErrorBoundary` component). PostHog product analytics added with `AnalyticsProvider` (root layout), `IdentifyUser` (dashboard layout), and `trackServerEvent` calls in 5 server action files and 2 API routes. See §5 Tracked Events Catalog.

19. **`[GAP]` CSP nonce support** — Current `Content-Security-Policy` header uses `'unsafe-inline'` and `'unsafe-eval'` for `script-src` due to Next.js static header limitations. Upgrade to nonce-based CSP via middleware for stronger XSS protection.

20. **`[GAP]` Analytics coverage — secondary actions not tracked** — `trackServerEvent` is not called in: `updateDailyTask`, `reopenDailyTask`, `skipDailyTask`, `carryOverTasks`, `changeTaskExecutor`, `updateContact`, `logContactOutreach`, `updateStrategyDoc`, `deleteStrategyDoc`. These omissions are intentional (high-frequency or secondary actions) but should be reviewed for product analytics completeness.
