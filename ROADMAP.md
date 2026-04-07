# DoTheseNow — Refactor & Feature Roadmap (v2)

> **Status**: Planning — No code changes yet
>
> Last updated: 2026-04-06
>
> **Conventions**: Phases are numbered `[N]`. Parallel worktrees within a phase are lettered `[NX]`. All worktrees in phase `[N]` MUST complete before any worktree in phase `[N+1]` begins. Worktrees with the same number can run concurrently without file or database conflicts.

---

## How to Read This Document

```
[1A] ─┐
[1B] ─┼─ All run in parallel (no shared files or DB objects)
      ┘
       │
       ▼ (merge all, run tests, verify)
[2A] ─┐
[2B] ─┤
[2C] ─┘
       │
       ▼
      ...
```

**Rules for worktree isolation:**
- No two worktrees in the same phase may modify the same file
- No two worktrees in the same phase may CREATE/ALTER the same database table
- Each worktree creates its own migration file with a unique sequence number (pre-assigned in Appendix A)
- Shared packages (`packages/types`, `packages/queries`, `packages/prompts`) are created in early phases and consumed READ-ONLY in later phases
- If a worktree depends on another worktree's output, they MUST be in different phases

**Merge protocol (after every phase):**
1. Merge to `main` in alphabetical order (A, B, C)
2. Run `npm run build && npm run type-check` after each merge
3. Run `npm run test` (full test suite) after all merges
4. Run user journey smoke tests (see Appendix D)
5. Resolve any integration issues before proceeding to the next phase
6. Update `PROGRESS.md` with phase completion status

---

## Changes from v1 (EM Review Fixes Applied)

| # | Finding | Resolution |
|---|---------|------------|
| C1 | [1C] can't truly parallel [1B] — depends on shared queries | Moved MCP refactor to Phase 3. Phase 1 is now [1A]+[1B] only |
| C2 | No user-facing value until Phase 3 | Pulled onboarding wizard into Phase 2 as [2C] — first user-visible improvement |
| C3 | `soft_delete(table_name)` is SQL injection vector | Replaced with per-table functions: `soft_delete_task()`, `soft_delete_contact()`, etc. |
| C4 | Credit deduction happens after LLM work, not before | Introduced reserve→capture→refund pattern in credit system |
| W5 | [3A]+[3B] implicit dependency on credits file | Inngest stubs credit deduction; real wiring deferred to integration phase |
| W6 | Shared queries only cover reads, not mutations | Mutations explicitly included in query packages |
| W7 | 5-step onboarding is too much cognitive load | Reduced to 3 steps: name → industry → budget. Growth motion inferred |
| W8 | `packages/shared/` becomes monolithic | Split into `packages/types/`, `packages/queries/`, `packages/prompts/` |
| W9 | No testing until Phase 4 | Testing infrastructure in Phase 1; every phase grows the test suite |
| W10 | Inngest function registry is a file conflict in Phase 5 | Auto-discovery pattern: each function file exports; index globs directory |
| S11 | Timezone not stored for cron scheduling | Added `timezone` to org profile migration |
| S13 | No user journey smoke tests | Added Appendix D with 3 persona-based smoke tests run every phase |

---

## Progressive Testing Strategy

Every phase builds on the testing foundation. Tests are not an afterthought — they are a deliverable in every worktree.

### Testing Layers

| Layer | Tool | Introduced In | What It Covers |
|-------|------|---------------|----------------|
| **Unit tests** | Vitest | [1A] | Pure functions: helpers, enums, state derivation, query builders |
| **Integration tests** | Vitest + Supabase local | [1B] | Shared queries against real DB, org isolation, RLS policies |
| **Dependency map tests** | Vitest (import analysis) | [1B] | Verify `packages/queries` never imports from `apps/web`; no circular deps |
| **API route tests** | Vitest + supertest | [4A] | Webhook handlers, API routes, Inngest function triggers |
| **E2E smoke tests** | Playwright | [2C] | Critical user journeys (see Appendix D) |
| **Agent output tests** | Vitest + snapshot | [6A] | LLM prompt→output quality: structure validation, field presence, industry accuracy |

### Per-Phase Testing Requirements

Every worktree's PR must include:
1. **Unit tests** for any new pure function, helper, or utility
2. **Integration tests** for any new query function or RPC call
3. **Dependency map assertion** — `packages/*` never import from `apps/*`
4. **Updated test count** — test count must increase or stay the same, never decrease

### Dependency Map Enforcement

```typescript
// packages/queries/__tests__/no-circular-deps.test.ts
// This test runs in CI and fails the build if violated
import { Project } from "ts-morph";

test("packages/queries does not import from apps/", () => {
  const project = new Project({ tsConfigFilePath: "../../tsconfig.json" });
  const violations = project.getSourceFiles("packages/queries/**/*.ts")
    .flatMap(f => f.getImportDeclarations())
    .filter(i => i.getModuleSpecifierValue().includes("apps/"));
  expect(violations).toHaveLength(0);
});
```

---

## Known Issues (Pre-Refactor Audit)

| ID | Issue | Severity | Fixed In |
|----|-------|----------|----------|
| BUG-001 | Cookie name mismatch: `dtn_active_org` vs `dtn_current_org` in layout.tsx and team/actions.ts | High | [1A] |
| BUG-002 | Org creation RLS — onboarding uses raw client-side INSERT with no error handling | Medium | [1A] |
| ARCH-001 | Manual `org_id` filtering on every query — no compile-time enforcement | High | [1B] |
| ARCH-002 | Code duplication between web server actions and MCP tools | High | [3A] |
| ARCH-003 | No shared type definitions — types inferred from Supabase per-file | Medium | [1B] |
| ARCH-004 | SECURITY DEFINER functions need manual org_id guards | Medium | [2A] |
| ARCH-005 | Invite state ambiguity — two patterns (pending vs auto-accepted) | Medium | [1A] |
| ARCH-006 | Freelancer RLS policies from 001 not updated for multi-tenancy | Low | [2A] |
| ARCH-007 | No DELETE policies on any table | Low | [2A] |
| ARCH-008 | Stripe billing uses $9.99 premium — needs new tier structure | Medium | [5A] |
| DEBT-001 | `review_submission` in MCP: 3 sequential writes without transaction | Medium | [3A] |
| DEBT-002 | No error boundaries or loading states on dashboard pages | Medium | [2B] |
| DEBT-003 | No test suite beyond tenant isolation tests | High | [1A], [1B] |

---

## Phase 1 — Foundation: Auth Safety, Types & Test Infrastructure

**Goal**: Fix critical bugs, establish shared type system, set up testing infrastructure. Every subsequent phase depends on this.

**Migration sequence numbers**: 010 (reserved, likely unused)

```
[1A] Auth & Org Context Fix + Test Infra  ─┐  (no file overlap)
[1B] Shared Type Packages                  ─┘
```

---

### [1A] Auth, Org Context Hardening & Test Infrastructure

**Branch**: `refactor/1a-auth-test-infra`

**Problem**: Cookie name mismatch causes silent org-switching failures. Onboarding is fragile. No test infrastructure exists.

**Dependency map** (what calls what):
```
middleware.ts → supabase/middleware.ts → Supabase Auth
layout.tsx → auth-helpers.ts → org-context.ts (cookie read)
                             → supabase/server.ts (membership query)
onboarding/page.tsx → supabase/client.ts (INSERT org, membership, dept)
team/actions.ts → auth-helpers.ts → org-context.ts (cookie read)
                → supabase/admin.ts (RPC: invite_team_member)
```

**Files modified**:
- `apps/web/src/lib/org-context.ts`
- `apps/web/src/lib/auth-helpers.ts`
- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/app/(dashboard)/onboarding/page.tsx`
- `apps/web/src/lib/team/actions.ts`
- `apps/web/src/middleware.ts`

**Files created**:
- `apps/web/vitest.config.ts`
- `apps/web/src/__tests__/setup.ts` — Test setup with mocks
- `apps/web/src/lib/__tests__/org-context.test.ts`
- `apps/web/src/lib/__tests__/auth-helpers.test.ts`
- `apps/web/src/lib/__tests__/membership-state.test.ts`

**Deliverables**:

1. **Fix cookie name constant** — Export `ORG_COOKIE_NAME = "dtn_active_org"` from `org-context.ts`. Replace every raw string `"dtn_active_org"` and `"dtn_current_org"` across the codebase. Grep to confirm zero remaining raw strings.

2. **Harden onboarding flow** — Wrap org creation (INSERT org → INSERT membership → INSERT dept) in a server action using `createAdminClient()`. Try/catch with rollback (delete org if membership fails). Validate slug uniqueness before insert.

3. **Request-scoped org context** — `getRequestContext()` using `React.cache()` so multiple server components share a single auth+org lookup per request.

4. **Standardize membership states**:
   ```typescript
   type MembershipState = "pending" | "active" | "inactive";
   function getMembershipState(m: { user_id: string | null; is_active: boolean }): MembershipState;
   ```

5. **Vitest setup for web app** — Configure Vitest with path aliases, Supabase client mocks, cookie mocks. Write unit tests for:
   - `org-context.ts`: get/set/clear cookie, constant value
   - `auth-helpers.ts`: getRequestContext returns cached result, handles missing cookie
   - `getMembershipState()`: all 3 state transitions

**Database changes**: None.

**Test deliverables** (minimum):
- [ ] 8+ unit tests for auth/org helpers
- [ ] `npm run test` script added to `apps/web/package.json`
- [ ] `grep -r "dtn_current_org" apps/` returns zero results
- [ ] `grep -r '"dtn_active_org"' apps/ | grep -v org-context.ts` returns zero results

---

### [1B] Shared Type & Query Packages

**Branch**: `refactor/1b-shared-packages`

**Problem**: Types inferred per-file. No centralized enums. No way to enforce org_id at compile time. Queries duplicated between web and MCP.

**Dependency map** (new packages, consumed by everything downstream):
```
packages/types/     → imported by: packages/queries, packages/mcp-server, apps/web
packages/queries/   → imported by: packages/mcp-server, apps/web
                    → imports from: packages/types (types only, never apps/)
```

**Files created**:
- `packages/types/package.json`, `tsconfig.json`
- `packages/types/src/index.ts`
- `packages/types/src/database.ts` — Generated Supabase types
- `packages/types/src/domain.ts` — Clean domain interfaces
- `packages/types/src/enums.ts` — TaskStatus, ExecutorType, MemberRole, PlanTier, etc.
- `packages/queries/package.json`, `tsconfig.json`
- `packages/queries/src/index.ts`
- `packages/queries/src/tasks.ts` — Read + mutation query builders
- `packages/queries/src/strategy.ts`
- `packages/queries/src/contacts.ts`
- `packages/queries/src/approvals.ts`
- `packages/queries/src/org.ts`
- `packages/queries/src/memberships.ts`
- `packages/queries/src/__tests__/no-circular-deps.test.ts`
- `packages/queries/src/__tests__/tasks.test.ts`
- `packages/queries/src/__tests__/org-isolation.test.ts`

**Files modified**:
- `package.json` (root) — Add workspaces
- `turbo.json` — Add build targets for new packages
- `apps/web/package.json` — Add dependencies
- `packages/mcp-server/package.json` — Add dependencies

**Deliverables**:

1. **Generate Supabase types** — `supabase gen types typescript` → `packages/types/src/database.ts`. Single source of truth.

2. **Domain types with camelCase mapping** — Clean interfaces + mapper functions:
   ```typescript
   export interface DailyTask {
     id: string; orgId: string; title: string; status: TaskStatus;
     priority: TaskPriority; executorType: ExecutorType;
     scheduledDate: string; /* ... */
   }
   export function toDailyTask(row: Database["public"]["Tables"]["dtn_daily_tasks"]["Row"]): DailyTask;
   ```

3. **Shared enums** — All magic strings consolidated:
   ```typescript
   export enum TaskStatus { Pending = "pending", InProgress = "in_progress", Completed = "completed", Failed = "failed", Skipped = "skipped", CarriedOver = "carried_over" }
   export enum ExecutorType { Self = "self", N8n = "n8n", ClaudeApi = "claude_api", Freelancer = "freelancer" }
   export enum MemberRole { Owner = "owner", Admin = "admin", Member = "member" }
   export enum PlanTier { Free = "free", Starter = "starter", Growth = "growth", Team = "team", Enterprise = "enterprise" }
   ```

4. **Org-scoped query builders (reads AND mutations)**:
   ```typescript
   // Read
   export function getTasksForOrg(client: SupabaseClient, orgId: string, filters?: TaskFilters);
   // Mutation
   export function createTaskForOrg(client: SupabaseClient, orgId: string, task: CreateTaskInput);
   export function updateTaskForOrg(client: SupabaseClient, orgId: string, taskId: string, updates: UpdateTaskInput);
   ```
   Every function requires `orgId` — impossible to forget.

5. **Plan constants** — Move from `stripe/config.ts`:
   ```typescript
   // packages/types/src/plans.ts
   export const PLAN_LIMITS: Record<PlanTier, { members: number; credits: number; strategyDocs: number }>;
   export function canAccessFeature(plan: PlanTier, feature: string): boolean;
   ```

6. **Dependency map test** — Automated test that `packages/queries` never imports from `apps/`. Fails the build if violated.

7. **Integration tests** — Test shared queries against Supabase local:
   - Two test org UUIDs, verify cross-org reads return zero rows
   - Mutation queries set correct org_id
   - Query filters work (status, date, type)

**Database changes**: None.

**Test deliverables** (minimum):
- [ ] 15+ unit tests (type mappers, enum values, plan limits)
- [ ] 10+ integration tests (query builders against Supabase local)
- [ ] 1 dependency map test (no circular imports)
- [ ] `npm run test` scripts in both new packages
- [ ] `npm run build && npm run type-check` passes for all packages

---

## Phase 2 — Database Hardening, UI Safety & Quick Win

**Goal**: Fix database issues, add error boundaries, deliver first user-visible improvement (onboarding wizard).

**Migration sequence numbers**: 011–013

**Depends on**: Phase 1 complete.

```
[2A] Database Hardening (SQL only)          ─┐
[2B] Error Boundaries & UI Polish           ─┤  (no file overlap)
[2C] Onboarding Wizard (user-facing!)       ─┘
```

---

### [2A] Database Schema Hardening

**Branch**: `refactor/2a-db-hardening`

**Problem**: Freelancer RLS from 001 not org-scoped. No soft delete. No task event log. No centralized state transitions.

**Dependency map**:
```
transition_task_status() → UPDATE dtn_daily_tasks
                         → INSERT dtn_task_events
                         → validates via allowed_transitions array
soft_delete_task()       → UPDATE dtn_daily_tasks SET deleted_at = now()
soft_delete_contact()    → UPDATE mktg_contacts SET deleted_at = now()
get_user_org_ids()       → used by all new RLS policies (existing helper)
```

**Files created**:
- `supabase/migrations/011_harden_freelancer_rls.sql`
- `supabase/migrations/012_soft_delete.sql`
- `supabase/migrations/013_task_event_log.sql`
- `supabase/__tests__/rls-policies.test.sql` — SQL-based RLS test script

**Deliverables**:

1. **Migration 011 — Freelancer RLS** — Drop old email-based policies from 001. Replace with org_id-scoped policies using `get_user_org_ids()`. Freelancer SELECT checks both org membership AND assignment.

2. **Migration 012 — Soft delete** — Add `deleted_at TIMESTAMPTZ DEFAULT NULL` to: `dtn_organizations`, `dtn_daily_tasks`, `mktg_contacts`, `mktg_strategy_docs`, `mktg_campaigns`. Partial index `WHERE deleted_at IS NULL` on each. Update RLS SELECT policies: `AND deleted_at IS NULL`. **Per-table soft delete functions** (not generic):
   ```sql
   CREATE FUNCTION soft_delete_task(p_task_id UUID, p_org_id UUID) RETURNS VOID AS $$
   BEGIN
     UPDATE dtn_daily_tasks SET deleted_at = now()
     WHERE id = p_task_id AND org_id = p_org_id AND deleted_at IS NULL;
     IF NOT FOUND THEN RAISE EXCEPTION 'Task not found or already deleted'; END IF;
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
   -- Repeat for: soft_delete_contact, soft_delete_strategy_doc, soft_delete_campaign
   ```

3. **Migration 013 — Task event log + state machine**:
   ```sql
   CREATE TABLE dtn_task_events (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     task_id UUID NOT NULL REFERENCES dtn_daily_tasks(id),
     org_id UUID NOT NULL REFERENCES dtn_organizations(id),
     event_type TEXT NOT NULL,
     previous_state JSONB, new_state JSONB,
     source TEXT NOT NULL, -- web_ui, slack_bot, mcp, cron, agent, api
     actor_id UUID,
     metadata JSONB DEFAULT '{}',
     created_at TIMESTAMPTZ DEFAULT now()
   );
   CREATE INDEX idx_task_events_task ON dtn_task_events(task_id, created_at);
   CREATE INDEX idx_task_events_org ON dtn_task_events(org_id, created_at);

   CREATE FUNCTION transition_task_status(
     p_task_id UUID, p_org_id UUID, p_new_status TEXT,
     p_source TEXT, p_actor_id UUID DEFAULT NULL, p_metadata JSONB DEFAULT '{}'
   ) RETURNS UUID AS $$
   DECLARE
     v_current_status TEXT;
     v_allowed TEXT[];
     v_event_id UUID;
   BEGIN
     SELECT status INTO v_current_status FROM dtn_daily_tasks
     WHERE id = p_task_id AND org_id = p_org_id FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;

     -- Legal transitions
     v_allowed := CASE v_current_status
       WHEN 'pending' THEN ARRAY['in_progress', 'skipped', 'carried_over']
       WHEN 'in_progress' THEN ARRAY['completed', 'failed', 'blocked', 'skipped']
       WHEN 'blocked' THEN ARRAY['in_progress', 'skipped', 'carried_over']
       WHEN 'failed' THEN ARRAY['in_progress', 'carried_over']
       ELSE ARRAY[]::TEXT[]
     END;
     IF NOT p_new_status = ANY(v_allowed) THEN
       RAISE EXCEPTION 'Invalid transition: % → %', v_current_status, p_new_status;
     END IF;

     UPDATE dtn_daily_tasks SET status = p_new_status,
       completed_at = CASE WHEN p_new_status = 'completed' THEN now() ELSE completed_at END
     WHERE id = p_task_id;

     INSERT INTO dtn_task_events (task_id, org_id, event_type, previous_state, new_state, source, actor_id, metadata)
     VALUES (p_task_id, p_org_id, 'status_changed',
       jsonb_build_object('status', v_current_status),
       jsonb_build_object('status', p_new_status),
       p_source, p_actor_id, p_metadata)
     RETURNING id INTO v_event_id;

     RETURN v_event_id;
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
   ```

4. **RLS test script** — SQL script that creates test users and verifies:
   - User A cannot read User B's org data
   - Freelancer can only see assigned tasks
   - Soft-deleted rows are invisible via SELECT
   - `transition_task_status()` rejects invalid transitions

**Files modified**: None in `apps/` or `packages/`.

**Test deliverables**:
- [ ] Migrations apply cleanly to fresh Supabase
- [ ] RLS test script passes with zero violations
- [ ] `transition_task_status()` test: 5+ valid transitions, 3+ rejected transitions
- [ ] Soft delete test: row invisible after delete, undelete possible

---

### [2B] Error Boundaries, Loading States & E2E Setup

**Branch**: `refactor/2b-ui-safety-e2e`

**Problem**: No error boundaries. No loading skeletons. No Suspense boundaries. No E2E test infrastructure.

**Dependency map**:
```
page.tsx (server) → ErrorBoundary (client wrapper)
                  → Suspense → PageSkeleton (fallback)
                  → data fetch → client component
```

**Files created**:
- `apps/web/src/components/ui/error-boundary.tsx`
- `apps/web/src/components/ui/page-skeleton.tsx`
- `apps/web/src/components/ui/empty-state.tsx`
- `apps/web/playwright.config.ts`
- `apps/web/e2e/setup/global-setup.ts`
- `apps/web/e2e/smoke/onboarding.spec.ts`
- `apps/web/e2e/smoke/tasks.spec.ts`
- `apps/web/e2e/smoke/navigation.spec.ts`

**Files modified** (components and pages only — NO lib/, NO actions):
- `apps/web/src/components/dashboard/sidebar.tsx`
- `apps/web/src/components/daily-tasks/tasks-page-client.tsx`
- `apps/web/src/components/contacts/contacts-page-client.tsx`
- `apps/web/src/components/strategy/doc-list.tsx`
- `apps/web/src/components/approvals/approvals-page-client.tsx`
- `apps/web/src/app/(dashboard)/[dept]/tasks/page.tsx`
- `apps/web/src/app/(dashboard)/[dept]/strategy/page.tsx`
- `apps/web/src/app/(dashboard)/[dept]/contacts/page.tsx`
- `apps/web/src/app/(dashboard)/[dept]/pipeline/page.tsx`
- `apps/web/src/app/(dashboard)/[dept]/approvals/page.tsx`
- `apps/web/package.json` — Add Playwright dev dependency

**Deliverables**:

1. **Error boundary** — Client component catching render errors with retry button and "Report issue" link. Uses shadcn Alert component.

2. **Page skeletons** — Skeleton variants for: table page, card grid, editor. Uses shadcn Skeleton.

3. **Empty states** — Reusable component: icon + message + action button. One per page type.

4. **Suspense boundaries** — Wrap `useSearchParams()` consumers in `<Suspense>`.

5. **Playwright E2E setup** — 3 initial smoke tests (see Appendix D):
   - Onboarding: signup → create org → land on dashboard
   - Task flow: navigate to tasks → create task → see it in list
   - Navigation: sidebar links all resolve, no 404s

**Database changes**: None.

**Test deliverables**:
- [ ] 3 Playwright smoke tests passing
- [ ] Error boundary renders on simulated error (unit test)
- [ ] No hydration warnings from `useSearchParams()`
- [ ] `npm run test:e2e` script added

---

### [2C] Onboarding Wizard (First User-Visible Improvement)

**Branch**: `feature/2c-onboarding-wizard`

**Problem**: Current onboarding is a single "org name" field. No strategy guidance. Slow time-to-value.

**Dependency map**:
```
onboarding-wizard.tsx (client) → createOrg server action (lib/org/actions.ts is [1A] owned)
                                → BUT: we create a NEW action file, not modify [1A]'s file
industry-selector.tsx  → shared enums from packages/types (Phase 1)
budget-selector.tsx    → shared enums from packages/types (Phase 1)
```

**Note on file ownership**: [1A] modified `onboarding/page.tsx`. [2C] replaces its content with the wizard. This is safe because [1A] is merged before Phase 2 starts. The wizard calls a NEW server action file (`lib/onboarding/actions.ts`) — not the files [2B] touches.

**Files created**:
- `apps/web/src/lib/onboarding/actions.ts` — New action file (separate from org/actions.ts)
- `apps/web/src/components/onboarding/onboarding-wizard.tsx`
- `apps/web/src/components/onboarding/industry-selector.tsx`
- `apps/web/src/components/onboarding/budget-selector.tsx`
- `packages/types/src/templates/b2b-saas-bootstrap.md`
- `packages/types/src/templates/dev-tools-bootstrap.md`
- `packages/types/src/templates/dtc-ecommerce-bootstrap.md`
- `packages/types/src/templates/fintech-bootstrap.md`
- `packages/types/src/templates/marketplace-bootstrap.md`
- `packages/types/src/templates/healthtech-bootstrap.md`
- `packages/types/src/templates/other-bootstrap.md`
- `packages/types/src/templates/b2b-saas-growth.md`
- `packages/types/src/templates/dtc-ecommerce-growth.md`
- `supabase/migrations/014_org_profile_fields.sql`
- `apps/web/src/lib/__tests__/onboarding-actions.test.ts`

**Files modified**:
- `apps/web/src/app/(dashboard)/onboarding/page.tsx` — Replace with wizard
- `apps/web/src/components/strategy/strategy-generator-dialog.tsx` (NEW)
- `apps/web/src/app/(dashboard)/[dept]/strategy/page.tsx` — Add "Generate from template" button

**Deliverables**:

1. **3-step onboarding wizard** (reduced from 5 — per UX review):
   - Step 1: Org name and slug
   - Step 2: Industry (B2B SaaS, Developer Tools, DTC eCommerce, Fintech, Marketplace, Healthtech, Other — all have pre-built templates)
   - Step 3: Monthly marketing budget (Bootstrap <$1K, Growth $1K–$10K, Scale $10K+)

   Growth motion and stage are **inferred** from industry + budget (editable later in settings). Display: "We'll tailor your strategy — you can refine anytime."

2. **Migration 014** — Add to `dtn_organizations`:
   - `industry TEXT`
   - `stage TEXT`
   - `budget_tier TEXT`
   - `growth_motion TEXT`
   - `timezone TEXT DEFAULT 'America/New_York'`
   All nullable (existing orgs unaffected).

3. **Strategy templates** — 9 pre-written markdown templates (not LLM-generated yet), covering all supported industries at Bootstrap tier + Growth tier for high-demand verticals:
   - B2B SaaS Bootstrap (content/SEO, LinkedIn, PLG focus)
   - Developer Tools Bootstrap (docs, community, OSS focus)
   - DTC eCommerce Bootstrap (email/SMS, Meta ads focus)
   - Fintech Bootstrap (compliance content, partnerships, trust-building focus)
   - Marketplace Bootstrap (supply-side outreach, demand-side SEO, referral focus)
   - Healthtech Bootstrap (professional content, pilot programs, clinical credibility focus)
   - Other/General Bootstrap (discovery-focused fallback for unlisted industries)
   - B2B SaaS Growth (scaled channels, attribution model, $1K–$10K/mo budget)
   - DTC eCommerce Growth (owned channel shift, ROAS optimization, $1K–$10K/mo budget)
   Each follows GACCS brief format with ICE-scored experiment backlog (ICE = Impact × Confidence × Ease, range 1–1000). See `packages/prompts/reference/gaccs-brief-format.md` for the full GACCS section specification.

4. **Strategy generator dialog** — Modal that reads org industry/budget → selects template → creates strategy doc. Pre-written templates for now; LLM generation comes Phase 6.

**Test deliverables**:
- [ ] Unit tests for industry→stage inference logic
- [ ] Unit tests for template selection logic
- [ ] Existing onboarding E2E smoke test (from [2B]) updated to cover 3-step wizard
- [ ] New user reaches dashboard with strategy doc in <2 minutes

---

## Phase 3 — Migrate Web & MCP to Shared Layer

**Goal**: Eliminate query duplication. Both web server actions and MCP tools consume shared packages. All task status changes go through the centralized state machine.

**Migration sequence numbers**: None (code-only).

**Depends on**: Phase 2 complete (shared queries exist, state machine exists, onboarding improved).

```
[3A] MCP Server → Shared Queries        ─┐
[3B] Web Server Actions → Shared Queries ─┘  (no file overlap)
```

---

### [3A] MCP Server → Shared Queries

**Branch**: `refactor/3a-mcp-shared-queries`

**Dependency map**:
```
packages/mcp-server/src/tools/*.ts → packages/queries/* (reads + mutations)
                                    → packages/types/* (enums, domain types)
packages/mcp-server/src/lib/supabase.ts → OrgScopedClient wraps shared queries
```

**Files modified** (MCP server only):
- `packages/mcp-server/package.json`
- `packages/mcp-server/src/lib/supabase.ts`
- `packages/mcp-server/src/tools/crm.ts`
- `packages/mcp-server/src/tools/strategy.ts`
- `packages/mcp-server/src/tools/daily-tasks.ts`
- `packages/mcp-server/src/tools/approvals.ts`
- `packages/mcp-server/src/tools/marketplace.ts`
- `packages/mcp-server/src/tools/campaigns.ts`
- `packages/mcp-server/src/tools/types.ts`
- `packages/mcp-server/src/__tests__/tenant-isolation.test.ts`

**Deliverables**:

1. **Replace all inline queries** with `@dothesenow/queries/*` calls — reads AND mutations.
2. **Import shared types** from `@dothesenow/types/*` — enums, domain interfaces.
3. **Simplify OrgScopedClient** to wrap shared query builders with orgId.
4. **Use `transition_task_status()` RPC** for all task status changes.
5. **Fix `review_submission` transaction debt** (DEBT-001) — wrap 3 sequential writes in single RPC.
6. **Update tenant isolation tests** — verify shared queries enforce org_id from MCP context.

**Test deliverables**:
- [ ] Existing tenant isolation tests still pass (now testing shared queries)
- [ ] Zero inline `.from("table")` calls remain in tool handlers
- [ ] New tests: `transition_task_status()` called correctly from MCP tools
- [ ] Build passes: `npm run build`

---

### [3B] Web Server Actions → Shared Queries

**Branch**: `refactor/3b-web-shared-queries`

**Dependency map**:
```
apps/web/src/lib/*/actions.ts → packages/queries/* (reads + mutations)
                               → packages/types/* (enums, domain types)
                               → transition_task_status() RPC (from [2A])
apps/web/src/lib/stripe/config.ts → packages/types/src/plans.ts (constants)
```

**Files modified** (web server actions only):
- `apps/web/src/lib/strategy/actions.ts`
- `apps/web/src/lib/contacts/actions.ts`
- `apps/web/src/lib/daily-tasks/actions.ts`
- `apps/web/src/lib/daily-tasks/dispatch.ts`
- `apps/web/src/lib/approvals/actions.ts`
- `apps/web/src/lib/team/actions.ts`
- `apps/web/src/lib/stripe/config.ts`
- `apps/web/src/lib/stripe/actions.ts`
- `apps/web/src/lib/org/actions.ts`
- `apps/web/src/lib/onboarding/actions.ts`

**Deliverables**:

1. **Replace inline queries** with `@dothesenow/queries/*` for all reads and mutations.
2. **Import plan constants** from `@dothesenow/types/plans` instead of local `stripe/config.ts`.
3. **Shared types** — explicit return types on all exported server actions using domain types.
4. **Use `transition_task_status()` RPC** for: `completeDailyTask`, `skipDailyTask`, dispatch error handlers.
5. **Add explicit return types** to every exported action function.

**Test deliverables**:
- [ ] All existing E2E smoke tests still pass (regression)
- [ ] Zero direct `.from("dtn_*")` or `.from("mktg_*")` calls remain in actions
- [ ] New unit tests: action return types match domain types
- [ ] `npm run type-check` passes

---

## Phase 4 — Inngest & Credit System (Async Foundation)

**Goal**: Durable execution framework, credit system for AI usage. No LLM calls yet — just the plumbing.

**Migration sequence numbers**: 015–016

**Depends on**: Phase 3 complete (all code uses shared queries, state machine in place).

```
[4A] Inngest Setup + Cron Functions     ─┐
[4B] Credit System + Pricing Migration  ─┘  (no file overlap)
```

---

### [4A] Inngest Integration

**Branch**: `feature/4a-inngest`

**Dependency map**:
```
apps/web/src/app/api/inngest/route.ts → inngest/client.ts → Inngest SDK
inngest/functions/overdue-tasks.ts    → packages/queries/tasks (read overdue)
                                      → transition_task_status() RPC
inngest/functions/agent-executor.ts   → packages/queries/tasks (read task)
                                      → Anthropic SDK (call Claude)
                                      → creditStub() (placeholder, wired in Phase 5)
apps/web/src/lib/daily-tasks/dispatch.ts → inngest.send() (replaces direct HTTP)
```

**Files created**:
- `apps/web/src/lib/inngest/client.ts`
- `apps/web/src/lib/inngest/functions/overdue-tasks.ts`
- `apps/web/src/lib/inngest/functions/agent-executor.ts`
- `apps/web/src/lib/inngest/functions/daily-task-generation.ts` (stub)
- `apps/web/src/app/api/inngest/route.ts`
- `apps/web/src/lib/inngest/__tests__/overdue-tasks.test.ts`
- `apps/web/src/lib/inngest/__tests__/agent-executor.test.ts`

**Files modified**:
- `apps/web/package.json` — Add `inngest`
- `apps/web/src/lib/daily-tasks/dispatch.ts` — Fire Inngest events

**Note**: Inngest function registry uses **auto-discovery** pattern — each function file exports its function, `api/inngest/route.ts` imports all via barrel file. No single index file to conflict in future phases.

**Deliverables**:

1. **Inngest client** — Event schemas, Vercel integration config.

2. **Overdue task detection** — Cron (daily 9am UTC fan-out by org timezone):
   - >24hr → reminder
   - >48hr → escalate to admin
   - >72hr → force-flag in dashboard

3. **Agent executor via Inngest** — Replace `/api/executors/claude/route.ts`:
   - Step 1: Load task
   - Step 2: Load strategy context
   - Step 3: **Reserve credits** (stub: always returns success)
   - Step 4: Call Claude API
   - Step 5: Create approval entry
   - Step 6: **Confirm credits** (stub)
   - On failure: **Refund credits** (stub) + mark task failed

4. **Daily task generation stub** — Inngest cron (7am fan-out by timezone). Logs "generation requested." Real LLM pipeline in Phase 6.

5. **Dispatch migration** — `dispatch.ts` fires Inngest events instead of HTTP.

**Test deliverables**:
- [ ] Unit tests: overdue detection logic (mock time, verify escalation tiers)
- [ ] Unit tests: agent executor step sequence (mock Inngest steps)
- [ ] Integration: dispatch.ts sends correct event shape
- [ ] Inngest dev server shows all registered functions

---

### [4B] Credit System & Pricing Tier Migration

**Branch**: `feature/4b-credits-pricing`

**Dependency map**:
```
packages/types/src/plans.ts ← updated with new tiers + credit allocations
apps/web/src/lib/credits/actions.ts → packages/queries/credits.ts (new)
                                    → reserve/confirm/refund pattern
apps/web/src/lib/stripe/actions.ts  → updated checkout for new tiers
apps/web/src/app/api/webhooks/stripe/route.ts → maps new prices to tiers
```

**Files created**:
- `supabase/migrations/015_pricing_tiers.sql`
- `supabase/migrations/016_credit_ledger.sql`
- `packages/queries/src/credits.ts`
- `apps/web/src/lib/credits/actions.ts`
- `apps/web/src/components/billing/plan-comparison.tsx`
- `apps/web/src/components/billing/credit-usage.tsx`
- `apps/web/src/lib/credits/__tests__/credit-actions.test.ts`
- `packages/queries/src/__tests__/credits.test.ts`

**Files modified**:
- `packages/types/src/enums.ts` — PlanTier updated
- `packages/types/src/plans.ts` — New tier definitions
- `apps/web/src/lib/stripe/config.ts` — New price IDs
- `apps/web/src/lib/stripe/actions.ts` — Updated checkout
- `apps/web/src/app/api/webhooks/stripe/route.ts` — Handle new plans
- `apps/web/src/app/(dashboard)/settings/billing/page.tsx` — New UI

**Deliverables**:

1. **Migration 015** — Alter `dtn_organizations.plan` CHECK to new tiers. Add `ai_credits_remaining INTEGER DEFAULT 50`, `ai_credits_reset_at TIMESTAMPTZ`.

2. **Migration 016** — `dtn_credit_ledger` table:
   ```sql
   CREATE TABLE dtn_credit_ledger (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     org_id UUID NOT NULL REFERENCES dtn_organizations(id),
     amount INTEGER NOT NULL, -- positive = credit, negative = debit
     balance_after INTEGER NOT NULL,
     reason TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'confirmed', -- reserved, confirmed, refunded
     reference_id UUID, -- task_id, strategy_doc_id, etc.
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```

3. **Reserve → Capture → Refund pattern**:
   ```typescript
   export async function reserveCredits(orgId: string, amount: number, reason: string): Promise<string>; // returns ledger_id
   export async function confirmCredits(ledgerId: string): Promise<void>;
   export async function refundCredits(ledgerId: string): Promise<void>;
   ```
   Reserve uses `SELECT FOR UPDATE` to prevent overdraft under concurrency. Confirms/refunds update ledger status.

4. **Stripe migration** — New products/prices. Grandfather existing Premium → Starter. Webhook handles new price→tier mapping.

5. **Billing UI** — Plan comparison, credit usage indicator, upgrade/downgrade.

**Test deliverables**:
- [ ] Unit tests: reserve/confirm/refund state transitions (8+ tests)
- [ ] Integration: concurrent reservations don't overdraft (race condition test)
- [ ] Integration: existing Premium users mapped to Starter on webhook
- [ ] E2E: upgrade flow works through Stripe test mode

---

## Phase 5 — Integration: Wire Credits to Inngest, Complete Billing

**Goal**: Small integration phase to wire the credit system (4B) into Inngest functions (4A). This exists because 4A and 4B ran in parallel and both need to be merged before wiring.

**Migration sequence numbers**: None.

**Depends on**: Phase 4 complete.

```
[5A] Wire Credits to Inngest Executors (single worktree)
```

---

### [5A] Credits ↔ Inngest Integration

**Branch**: `feature/5a-credits-inngest-wiring`

**Files modified**:
- `apps/web/src/lib/inngest/functions/agent-executor.ts` — Replace credit stubs with real calls
- `apps/web/src/lib/inngest/functions/daily-task-generation.ts` — Add credit check
- `apps/web/src/lib/daily-tasks/dispatch.ts` — Check credits before dispatch

**Deliverables**:
1. Agent executor: Step 3 calls `reserveCredits()`, Step 6 calls `confirmCredits()`, failure calls `refundCredits()`.
2. Task generation stub: pre-checks credit balance before triggering (will be used when real generation lands).
3. Dispatch: returns error if org has zero credits.

**Test deliverables**:
- [ ] Integration test: agent execution deducts correct credits
- [ ] Integration test: failed execution refunds credits
- [ ] Integration test: zero-credit org cannot dispatch agent task
- [ ] All E2E smoke tests still pass

---

## Phase 6 — Intelligence, Decomposition & Executor Framework

**Goal**: The core differentiators — LLM-powered strategy generation, automatic task decomposition, and a pluggable executor integration framework (with Jasper as the first BYOS executor).

**Migration sequence numbers**: 017–019

**Depends on**: Phase 5 complete (Inngest + credits fully wired).

```
[6A] Strategy Generation Engine             ─┐
[6B] Task Decomposition Engine              ─┤  (no file overlap)
[6C] Executor Integration Framework + Jasper ─┘
```

---

### [6A] Strategy Generation Engine

**Branch**: `feature/6a-strategy-engine`

**Dependency map**:
```
packages/prompts/src/strategy-generator.ts → framework prompts
apps/web/src/lib/inngest/functions/strategy-generation.ts
  → Step 1: packages/queries/org.ts (load profile)
  → Step 2: packages/prompts (select frameworks)
  → Step 3: Anthropic SDK (call Claude)
  → Step 4: packages/queries/strategy.ts (create doc)
  → Step 5: apps/web/src/lib/credits/actions.ts (reserve→confirm)
apps/web/src/components/strategy/strategy-generator-dialog.tsx → wired to Inngest
```

**Pre-built reference materials** (already prepared in `packages/prompts/reference/`):
- `gaccs-brief-format.md` — Exact output schema, section requirements, validation rules for generated strategy docs
- `industry-cac-benchmarks.md` — CAC ranges by industry × channel, budget tier pruning rules
- `framework-selection-matrix.md` — Decision logic for which frameworks apply per industry × budget tier
- `strategy-generator-framework-notes.md` — Detailed methodology, prompt fragments, and output schemas for Growth Matrix, Bullseye, GACCS, AARRR, ICE

**Files created**:
- `packages/prompts/package.json`, `tsconfig.json`
- `packages/prompts/src/index.ts`
- `packages/prompts/src/strategy-generator.ts`
- `packages/prompts/src/frameworks/growth-matrix.ts`
- `packages/prompts/src/frameworks/bullseye.ts`
- `packages/prompts/src/frameworks/gaccs.ts`
- `apps/web/src/lib/strategy/generate.ts`
- `apps/web/src/lib/inngest/functions/strategy-generation.ts`
- `packages/prompts/src/__tests__/strategy-generator.test.ts`
- `supabase/migrations/017_strategy_generation_metadata.sql`

**Files modified**:
- `package.json` (root) — Add `packages/prompts` workspace
- `turbo.json` — Build target
- `apps/web/src/components/strategy/strategy-generator-dialog.tsx` — Wire to LLM

**Deliverables**:

1. **`packages/prompts/` package** (new — separate from types/queries per W8 fix)
2. **Framework prompt library** encoding Growth Matrix, Bullseye, GACCS, AARRR, ICE, industry CAC data, budget pruning rules — implementation guide and prompt fragments in `packages/prompts/reference/strategy-generator-framework-notes.md`
3. **Generation pipeline** via Inngest: load profile → select frameworks → call Claude → parse → create doc → reserve→confirm credits
4. **Migration 017** — `generation_metadata JSONB` on `mktg_strategy_docs`
5. **Progress UI** — Real-time status via Supabase Realtime

**Test deliverables**:
- [ ] Snapshot tests: prompt templates produce valid structured prompts for each industry
- [ ] Unit tests: framework selection logic (industry→framework mapping)
- [ ] Integration: generation creates a strategy doc with correct structure
- [ ] Integration: credits deducted on success, refunded on failure
- [ ] Agent output test: generated doc has all required GACCS sections

---

### [6B] Strategy → Task Decomposition Engine

**Branch**: `feature/6b-task-decomposition`

**Dependency map**:
```
packages/prompts/src/task-decomposer.ts → decomposition prompt
apps/web/src/lib/inngest/functions/task-decomposition.ts
  → Step 1: packages/queries/strategy.ts (load active doc)
  → Step 2: packages/queries/tasks.ts (yesterday's outcomes via event log)
  → Step 3: Anthropic SDK
  → Step 4: packages/queries/tasks.ts (bulk insert)
  → Step 5: credits (reserve→confirm)
```

**Pre-built reference materials** (already prepared in `packages/prompts/reference/`):
- `task-decomposer-reference.md` — Decomposition heuristics (daily task budget, day-of-week patterns, carry-over logic, channel balance, experiment progression), task title conventions, executor assignment rules, duration estimates, and full prompt structure

**Files created**:
- `packages/prompts/src/task-decomposer.ts`
- `apps/web/src/lib/inngest/functions/task-decomposition.ts`
- `apps/web/src/lib/daily-tasks/generate.ts`
- `apps/web/src/components/daily-tasks/generate-tasks-dialog.tsx`
- `packages/prompts/src/__tests__/task-decomposer.test.ts`
- `supabase/migrations/018_task_strategy_linking.sql`

**Files modified**:
- `apps/web/src/lib/inngest/functions/daily-task-generation.ts` — Replace stub
- `apps/web/src/components/daily-tasks/tasks-page-client.tsx` — "Generate Today's Tasks" button

**Deliverables**:

1. **Decomposition prompt** — Strategy doc + yesterday's outcomes + ICE backlog + day of week → prioritized task list (implementation spec in `packages/prompts/reference/task-decomposer-reference.md`)
2. **Pipeline** via Inngest: load strategy → load outcomes → call Claude → parse → bulk INSERT → credits
3. **Daily cron** (from [4A] stub) wired to real decomposition
4. **"Generate Today's Tasks"** UI button
5. **Migration 018** — `strategy_doc_id UUID REFERENCES mktg_strategy_docs(id)`, `strategy_section_ref TEXT` on `dtn_daily_tasks`

**Test deliverables**:
- [ ] Snapshot tests: decomposition prompt valid for each industry
- [ ] Unit tests: task parsing from LLM output
- [ ] Integration: generated tasks have ICE scores + strategy_section_ref
- [ ] Integration: yesterday's failures influence today's priorities
- [ ] E2E: "Generate Tasks" button creates visible tasks

---

### [6C] Executor Integration Framework + Jasper BYOS

**Branch**: `feature/6c-executor-framework`

**Problem**: The current executor system hardcodes dispatch logic per executor type in `dispatch.ts` and `getExecutorAvailability()`. Adding each new integration (Jasper, Make, Zapier, future LLMs) requires modifying the same files, violating open/closed principle. Users with existing Jasper (or other tool) subscriptions cannot leverage them from within DoTheseNow. The `ExecutorType` enum is closed.

**Design principle**: Build the framework once, make every future executor a plug-in. Jasper is the first BYOS (Bring Your Own Subscription) executor and validates the pattern.

**Dependency map**:
```
packages/types/src/executors.ts (NEW)     → ExecutorDefinition interface, registry type
packages/queries/src/integrations.ts (NEW) → org_integrations CRUD (Vault-backed secrets)
apps/web/src/lib/executors/registry.ts (NEW) → executor registry (replaces dispatch.ts switch)
apps/web/src/lib/executors/builtin/claude.ts   ─┐
apps/web/src/lib/executors/builtin/n8n.ts      ─┤ refactored from dispatch.ts
apps/web/src/lib/executors/builtin/jasper.ts   ─┘ NEW — first BYOS executor
apps/web/src/lib/inngest/functions/executor-dispatch.ts → replaces direct dispatch
apps/web/src/app/(dashboard)/settings/integrations/page.tsx → real UI (replaces placeholder)
```

**Files created**:
- `packages/types/src/executors.ts`
- `packages/queries/src/integrations.ts`
- `packages/queries/src/__tests__/integrations.test.ts`
- `apps/web/src/lib/executors/registry.ts`
- `apps/web/src/lib/executors/types.ts`
- `apps/web/src/lib/executors/builtin/claude.ts`
- `apps/web/src/lib/executors/builtin/n8n.ts`
- `apps/web/src/lib/executors/builtin/jasper.ts`
- `apps/web/src/lib/executors/__tests__/registry.test.ts`
- `apps/web/src/lib/executors/__tests__/jasper.test.ts`
- `apps/web/src/components/settings/integration-card.tsx`
- `apps/web/src/components/settings/api-key-form.tsx`
- `apps/web/src/lib/inngest/functions/executor-dispatch.ts`
- `supabase/migrations/019_org_integrations.sql`

**Files modified**:
- `packages/types/src/enums.ts` — Extend `ExecutorType` with `JasperApi` (and make extensible)
- `apps/web/src/lib/daily-tasks/dispatch.ts` — Gut and delegate to registry
- `apps/web/src/app/(dashboard)/settings/integrations/page.tsx` — Replace placeholder
- `apps/web/src/components/daily-tasks/task-form-dialog.tsx` — Dynamic executor list from registry

**Isolation check — no conflicts with [6A] or [6B]**:
- [6A] owns: `packages/prompts/src/strategy-*`, `apps/web/src/lib/strategy/generate.ts`, `apps/web/src/lib/inngest/functions/strategy-generation.ts`, migration 017
- [6B] owns: `packages/prompts/src/task-decomposer.ts`, `apps/web/src/lib/inngest/functions/task-decomposition.ts`, `apps/web/src/lib/daily-tasks/generate.ts`, migration 018
- [6C] owns: `packages/types/src/executors.ts`, `packages/queries/src/integrations.ts`, `apps/web/src/lib/executors/*`, `apps/web/src/components/settings/*`, `apps/web/src/lib/inngest/functions/executor-dispatch.ts`, migration 019
- **Shared touch**: `packages/types/src/enums.ts` — [6C] adds `JasperApi` value. [6A] and [6B] read enums only. Safe: additive change, no conflict at merge.
- **Shared touch**: `apps/web/src/lib/daily-tasks/dispatch.ts` — [6C] refactors internals. [6B] modifies `daily-task-generation.ts` (different file). [6A] does not touch dispatch. Safe.
- **Shared touch**: `apps/web/src/components/daily-tasks/task-form-dialog.tsx` — [6C] makes executor list dynamic. [6B] adds "Generate Today's Tasks" button to `tasks-page-client.tsx` (different file). Safe.

**Deliverables**:

1. **`ExecutorDefinition` interface** — The pluggable contract every executor implements:
   ```typescript
   // packages/types/src/executors.ts
   export interface ExecutorDefinition {
     type: string;                          // e.g. "claude_api", "jasper_api", "n8n"
     label: string;                         // UI display name
     category: "builtin" | "byos" | "webhook"; // determines credential + billing behavior
     icon: string;                          // lucide icon name
     description: string;
     configSchema: ExecutorConfigField[];   // drives dynamic settings UI
     capabilities: ExecutorCapability[];    // "content_generation", "research", "automation"
     checkAvailability: (orgIntegrations: OrgIntegration[]) => { available: boolean; hint?: string };
     dispatch: (task: DispatchableTask, config: ExecutorRuntimeConfig) => Promise<void>;
     estimateCredits: (task: DispatchableTask) => number; // 0 for BYOS executors
   }

   export interface ExecutorConfigField {
     key: string;          // e.g. "api_key", "webhook_url"
     label: string;
     type: "secret" | "url" | "select" | "text";
     required: boolean;
     placeholder?: string;
     options?: { value: string; label: string }[]; // for "select" type
   }

   export type ExecutorCapability =
     | "content_generation"
     | "research"
     | "automation"
     | "outreach"
     | "analytics";
   ```

2. **Executor registry** — Discovery + dispatch router:
   ```typescript
   // apps/web/src/lib/executors/registry.ts
   import { claude } from "./builtin/claude";
   import { n8n } from "./builtin/n8n";
   import { jasper } from "./builtin/jasper";

   const EXECUTORS: ExecutorDefinition[] = [claude, n8n, jasper];
   // Future: dynamically load from org-installed plugins

   export function getExecutor(type: string): ExecutorDefinition;
   export function getAllExecutors(): ExecutorDefinition[];
   export function getAvailableExecutors(orgIntegrations: OrgIntegration[]): ExecutorDefinition[];
   export function getExecutorsWithCapability(cap: ExecutorCapability): ExecutorDefinition[];
   export async function dispatchToExecutor(task: DispatchableTask): Promise<void>;
   ```
   `dispatchToExecutor` replaces the current `doDispatch()` switch. It looks up the executor by type, calls `estimateCredits()` (reserves if >0, skips for BYOS), then calls `dispatch()`.

3. **Migration 019 — `dtn_org_integrations`** — Generic integration storage:
   ```sql
   CREATE TABLE dtn_org_integrations (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     org_id UUID NOT NULL REFERENCES dtn_organizations(id),
     integration_type TEXT NOT NULL,       -- 'jasper_api', 'n8n', 'make', etc.
     config JSONB NOT NULL DEFAULT '{}',   -- non-secret config (webhook URLs, preferences)
     vault_secret_id UUID,                 -- FK to Supabase Vault for API keys
     is_active BOOLEAN DEFAULT true,
     connected_at TIMESTAMPTZ DEFAULT now(),
     connected_by UUID REFERENCES auth.users(id),
     last_used_at TIMESTAMPTZ,
     last_error TEXT,
     created_at TIMESTAMPTZ DEFAULT now(),
     UNIQUE(org_id, integration_type)
   );
   -- RLS: org members can read, admins/owners can write
   CREATE POLICY "org_members_read_integrations" ON dtn_org_integrations
     FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));
   CREATE POLICY "org_admins_write_integrations" ON dtn_org_integrations
     FOR ALL USING (
       org_id IN (SELECT get_user_org_ids())
       AND EXISTS (
         SELECT 1 FROM dtn_memberships
         WHERE org_id = dtn_org_integrations.org_id
         AND user_id = auth.uid()
         AND role IN ('owner', 'admin')
         AND is_active = true
       )
     );
   ```

4. **Refactor builtin executors** — Extract `dispatchToClaude()` and `dispatchToN8n()` from `dispatch.ts` into `builtin/claude.ts` and `builtin/n8n.ts`, each implementing `ExecutorDefinition`. The `self` and `freelancer` types become no-op executors (dispatch is a no-op, they just exist for UI display and task assignment).

5. **Jasper BYOS executor** — First third-party integration:
   ```typescript
   // apps/web/src/lib/executors/builtin/jasper.ts
   export const jasper: ExecutorDefinition = {
     type: "jasper_api",
     label: "Jasper AI",
     category: "byos",
     icon: "Sparkles",
     description: "Content generation via your Jasper subscription. Bring your own API key.",
     capabilities: ["content_generation"],
     configSchema: [
       { key: "api_key", label: "Jasper API Key", type: "secret", required: true,
         placeholder: "Enter your Jasper API key from jasper.ai/settings" },
       { key: "brand_voice_id", label: "Brand Voice (optional)", type: "text", required: false,
         placeholder: "Jasper Brand Voice ID for consistent tone" },
     ],
     estimateCredits: () => 0,  // BYOS — user pays Jasper directly
     checkAvailability: (integrations) => {
       const jasperInt = integrations.find(i => i.integration_type === "jasper_api" && i.is_active);
       return jasperInt
         ? { available: true }
         : { available: false, hint: "Connect your Jasper account in Settings → Integrations" };
     },
     dispatch: async (task, config) => {
       // Call Jasper API with GACCS brief from task context
       // Map task_type to Jasper template/agent: blog_post → Blog Post agent, etc.
       // Submit to approval queue on completion (same as Claude flow)
     },
   };
   ```

6. **Integrations settings page** — Replace placeholder with real UI:
   - Card per integration: icon, name, description, status badge (Connected/Not Connected)
   - Connect flow: API key input → test call → store in Supabase Vault → activate
   - Disconnect flow: deactivate integration, remove Vault secret
   - Usage stats: last used, total tasks dispatched, last error
   - Dynamic rendering from `getAllExecutors().filter(e => e.category === "byos" || e.configSchema.length > 0)`

7. **Dynamic executor list in task form** — Replace hardcoded `EXECUTOR_TYPES` array in `task-form-dialog.tsx` with `getAllExecutors()` call. Show availability from `checkAvailability()`. Show capability badges so users know which executors can handle which task types.

8. **Inngest executor dispatch function** — New durable function replacing the direct HTTP dispatch:
   ```typescript
   // apps/web/src/lib/inngest/functions/executor-dispatch.ts
   export const executorDispatch = inngest.createFunction(
     { id: "executor-dispatch", retries: 2 },
     { event: "task/dispatch.requested" },
     async ({ event, step }) => {
       const { task } = event.data;
       const executor = getExecutor(task.executor_type);

       // Step 1: Reserve credits (skip for BYOS)
       const credits = executor.estimateCredits(task);
       let ledgerId: string | null = null;
       if (credits > 0) {
         ledgerId = await step.run("reserve-credits", () => reserveCredits(task.org_id, credits, `executor:${task.executor_type}`));
       }

       // Step 2: Load integration config from Vault
       const config = await step.run("load-config", () => loadExecutorConfig(task.org_id, task.executor_type));

       // Step 3: Execute
       try {
         await step.run("dispatch", () => executor.dispatch(task, config));
         if (ledgerId) await step.run("confirm-credits", () => confirmCredits(ledgerId));
       } catch (error) {
         if (ledgerId) await step.run("refund-credits", () => refundCredits(ledgerId));
         throw error;
       }
     }
   );
   ```

**Credit behavior by executor category**:
| Category | `estimateCredits()` | User pays | DTN charges |
|----------|--------------------:|-----------|-------------|
| `builtin` (Claude) | 5–50 (by task type) | Nothing extra | Credits deducted |
| `byos` (Jasper) | 0 | Their Jasper sub | Nothing — value is orchestration |
| `webhook` (n8n) | 1 (tracking only) | Their infra | Minimal credits |

**Future executors enabled by this framework** (no framework changes needed):
| Executor | Category | Config | Capabilities |
|----------|----------|--------|--------------|
| Make / Zapier | webhook | webhook_url + secret | automation |
| OpenAI / GPT | byos | api_key + model | content_generation, research |
| Midjourney | byos | api_key | content_generation (images) |
| Perplexity | byos | api_key | research |
| Resend / SendGrid | byos | api_key | outreach |
| Custom webhook | webhook | url + secret + headers | any |

**Test deliverables**:
- [ ] Unit tests: registry returns correct executors by type and capability (6+ tests)
- [ ] Unit tests: `estimateCredits()` returns 0 for all BYOS executors
- [ ] Unit tests: `checkAvailability()` reflects org integration state (8+ tests)
- [ ] Integration: Jasper dispatch sends correct payload shape (mocked API)
- [ ] Integration: BYOS dispatch skips credit reservation
- [ ] Integration: builtin dispatch still reserves/confirms/refunds credits
- [ ] Integration: `dtn_org_integrations` RLS — member can read, only admin can write
- [ ] E2E: Settings → Integrations → Connect Jasper → see "Connected" badge
- [ ] E2E: Task form shows Jasper as available executor after connection
- [ ] Regression: existing Claude and n8n dispatch still works through new registry

---

## Phase 7 — Agentic Execution: Blocker Resolution

**Goal**: The blocker classification and resolution agent chain.

**Migration sequence numbers**: 020

**Depends on**: Phase 6 complete.

```
[7A] Blocker Resolution Agent (single worktree — complex, needs full context)
```

---

### [7A] Blocker Resolution Agent

**Branch**: `feature/7a-blocker-agent`

**Pre-built reference materials** (already prepared in `packages/prompts/reference/`):
- `blocker-classifier-corpus.md` — 15 pre-classified example blockers (3 per type), few-shot prompt template, snapshot test structure, type definitions and resolution routing

**Files created**:
- `packages/prompts/src/blocker-classifier.ts`
- `packages/prompts/src/research-agent.ts`
- `packages/prompts/src/draft-agent.ts`
- `packages/types/src/blockers.ts`
- `apps/web/src/lib/inngest/functions/blocker-resolution.ts`
- `apps/web/src/lib/blockers/actions.ts`
- `apps/web/src/components/daily-tasks/blocker-dialog.tsx`
- `supabase/migrations/020_blocker_types.sql`

**Deliverables**:
1. Five blocker types: knowledge_gap, dependency, skill_gap, resource_constraint, decision_needed (definitions and examples in `packages/prompts/reference/blocker-classifier-corpus.md`)
2. Classifier → Router → Resolver chain via Inngest
3. Research Agent (RAG + web search), Draft Agent (copy/briefs)
4. PagerDuty-style escalation (24hr → 48hr → 72hr)
5. Migration 020: blocker columns on `dtn_daily_tasks`

**Test deliverables**:
- [ ] Snapshot tests: classifier prompt correctly categorizes 10+ example blockers
- [ ] Unit tests: escalation timing logic
- [ ] Integration: blocker classification creates correct event log entry
- [ ] Integration: Research Agent returns structured response
- [ ] E2E: report blocker → see classification badge → see resolution

---

## Phase 8 — Slack Integration

**Goal**: Slack as a first-class interaction surface.

**Migration sequence numbers**: 021–022

**Depends on**: Phase 7 complete (blockers work in-app, can now expose via Slack).

```
[8A] Slack OAuth + Core Handlers     ─┐
[8B] Slack Crons (Morning DM, EOD)   ─┘  (no file overlap)
```

---

### [8A] Slack OAuth & Core Interaction Handlers

**Branch**: `feature/8a-slack-core`

**Note on integrations page**: [6C] builds the integrations settings page with the executor framework. [8A] extends it with a Slack card (communication integration, not an executor). The `dtn_org_integrations` table from [6C]'s migration 019 is reused — Slack stores its OAuth tokens there with `integration_type = 'slack'`.

**Files created**:
- `apps/web/src/lib/slack/client.ts`
- `apps/web/src/lib/slack/oauth.ts`
- `apps/web/src/lib/slack/handlers/task-creation.ts`
- `apps/web/src/lib/slack/handlers/task-completion.ts`
- `apps/web/src/lib/slack/handlers/slash-commands.ts`
- `apps/web/src/app/api/slack/events/route.ts`
- `apps/web/src/app/api/slack/oauth/route.ts`
- `apps/web/src/app/api/slack/interactions/route.ts`
- `apps/web/src/components/settings/slack-integration-card.tsx`
- `supabase/migrations/021_slack_installations.sql`
- `supabase/migrations/022_slack_events_dedup.sql`

**Deliverables**:
1. `@vercel/slack-bolt` with Fluid Compute
2. OAuth flow → Supabase Vault for tokens
3. @mention for NL task creation, slash commands, interactive cards
4. Event deduplication table

---

### [8B] Slack Cron Functions (Morning DM & EOD Summary)

**Branch**: `feature/8b-slack-crons`

**Files created**:
- `apps/web/src/lib/inngest/functions/slack-morning-dm.ts`
- `apps/web/src/lib/inngest/functions/slack-eod-summary.ts`
- `apps/web/src/lib/slack/handlers/morning-dm.ts`

**Note**: Inngest functions use **auto-discovery** — no shared index file to conflict with [8A].

**Deliverables**:
1. Morning DM (8am per user timezone): today's tasks with priority badges
2. EOD summary (5pm): team channel summary of completed/blocked/carried
3. Bidirectional thread sync for tasks created from Slack

---

## Phase 9 — Closed Loop: Results & Feedback

**Goal**: Close the Analyze → Plan → Execute → Measure → Refine loop.

**Migration sequence numbers**: 023–024

**Depends on**: Phase 8 complete.

```
[9A] Results Dashboard              ─┐
[9B] Feedback Engine (auto-refine)  ─┘  (no file overlap)
```

---

### [9A] Results Dashboard

**Branch**: `feature/9a-results-dashboard`

**Files created**:
- `apps/web/src/app/(dashboard)/[dept]/results/page.tsx`
- `apps/web/src/components/results/channel-performance.tsx`
- `apps/web/src/components/results/experiment-tracker.tsx`
- `apps/web/src/components/results/weekly-retrospective.tsx`
- `apps/web/src/lib/results/actions.ts`
- `packages/queries/src/results.ts`
- `supabase/migrations/023_experiment_results.sql`

**Deliverables**:
1. `dtn_experiment_results` table linked to strategy experiments
2. Channel performance view (aggregated by `strategy_section_ref`)
3. Experiment tracker: Backlog → Running → Completed → Won/Lost
4. Weekly retrospective generator (Inngest Friday 4pm)

---

### [9B] Feedback Engine (Strategy Auto-Refinement)

**Branch**: `feature/9b-feedback-engine`

**Pre-built reference materials** (already prepared in `packages/prompts/reference/`):
- `strategy-refiner-reference.md` — Signal vs. noise thresholds, 6 refinement categories (channel_swap, budget_realloc, experiment_add, experiment_kill, goal_adjust, audience_refine), suggestion prioritization, approval flow, diff-based version control, and full prompt structure

**Files created**:
- `packages/prompts/src/strategy-refiner.ts`
- `apps/web/src/lib/inngest/functions/strategy-refinement.ts`
- `apps/web/src/components/strategy/refinement-suggestions.tsx`
- `apps/web/src/lib/strategy/refine.ts`
- `supabase/migrations/024_refinement_history.sql`

**Deliverables**:
1. Refinement prompt: strategy doc + 30 days results → suggested changes (implementation spec in `packages/prompts/reference/strategy-refiner-reference.md`)
2. Inngest pipeline: aggregate → call Claude → diff → approval item → apply on approve
3. Suggestion UI: accept/reject per suggestion → new doc version

**This closes the loop. The moat.**

---

## Phase 10 — Collaboration & Ecosystem

**Goal**: Multi-user collaboration, calendar, accountability features.

**Depends on**: Phase 9 complete.

> Phases 10–11 are **directional**. Full worktree specifications will be written during Phase 8, informed by learnings from Phases 4–9.

### [10A] BlockNote Collaborative Editor
Replace `@uiw/react-md-editor` with BlockNote + Yjs + Liveblocks. Real-time co-editing. YAML frontmatter for agents. Hybrid search (tsvector + pgvector).

### [10B] Google Calendar Integration
Extended properties for idempotent task→event linking. Escalating prominence. Both "aggressive" (Motion) and "intentional" (Sunsama) modes.

### [10C] Passive Aggressive Mode
Opt-in 5-level intensity. Configurable reminders. Grace periods. Streak mechanics. Safety valves.

---

## Phase 11 — Scale & Growth

**Depends on**: Phase 10 complete.

### [11A] Enterprise Features
SSO (SAML), API access, custom playbook builder, data export, audit logs.

### [11B] Template Marketplace
User-created strategy templates. Structured schema. Ratings. Creator economics.

### [11C] Advanced Analytics
Cross-org benchmarking (anonymized). Industry-level performance insights. Predictive recommendations.

---

## Appendix A: Migration Sequence Registry

| Number | Phase | Worktree | Description |
|--------|-------|----------|-------------|
| 001–009 | Legacy | — | Existing migrations (do not modify) |
| 010 | 1 | Reserved | Phase 1 spare (no migrations expected) |
| 011 | 2 | [2A] | Freelancer RLS hardening |
| 012 | 2 | [2A] | Soft delete + per-table delete functions |
| 013 | 2 | [2A] | Task event log + state transition function |
| 014 | 2 | [2C] | Org profile fields (industry, budget, timezone) |
| 015 | 4 | [4B] | Pricing tiers + credits column |
| 016 | 4 | [4B] | Credit ledger table |
| 017 | 6 | [6A] | Strategy doc generation metadata |
| 018 | 6 | [6B] | Task-to-strategy linking |
| 019 | 6 | [6C] | Org integrations table (executor framework) |
| 020 | 7 | [7A] | Blocker types on daily tasks |
| 021 | 8 | [8A] | Slack installations (extends org_integrations) |
| 022 | 8 | [8A] | Slack event deduplication |
| 023 | 9 | [9A] | Experiment results table |
| 024 | 9 | [9B] | Refinement history |

---

## Appendix B: File Ownership by Phase

### Phase 1
| File / Package | [1A] | [1B] |
|---------------|------|------|
| `apps/web/src/lib/org-context.ts` | ✏️ | |
| `apps/web/src/lib/auth-helpers.ts` | ✏️ | |
| `apps/web/src/app/(dashboard)/layout.tsx` | ✏️ | |
| `apps/web/src/app/(dashboard)/onboarding/page.tsx` | ✏️ | |
| `apps/web/src/lib/team/actions.ts` | ✏️ | |
| `apps/web/src/middleware.ts` | ✏️ | |
| `apps/web/vitest.config.ts` | ✏️ | |
| `packages/types/*` (NEW) | | ✏️ |
| `packages/queries/*` (NEW) | | ✏️ |
| `package.json` (root) | | ✏️ |
| `turbo.json` | | ✏️ |

### Phase 2
| File / Package | [2A] | [2B] | [2C] |
|---------------|------|------|------|
| `supabase/migrations/011–013` | ✏️ | | |
| `apps/web/src/components/ui/*` (error boundary, skeleton) | | ✏️ | |
| `apps/web/src/components/*/` (existing pages) | | ✏️ | |
| `apps/web/src/app/(dashboard)/[dept]/*/page.tsx` | | ✏️ | |
| `apps/web/playwright.config.ts` | | ✏️ | |
| `apps/web/src/app/(dashboard)/onboarding/page.tsx` | | | ✏️ |
| `apps/web/src/components/onboarding/*` (NEW) | | | ✏️ |
| `apps/web/src/lib/onboarding/actions.ts` (NEW) | | | ✏️ |
| `supabase/migrations/014` | | | ✏️ |
| `packages/types/src/templates/*` (NEW) | | | ✏️ |

### Phase 3
| File / Package | [3A] | [3B] |
|---------------|------|------|
| `packages/mcp-server/src/*` | ✏️ | |
| `apps/web/src/lib/*/actions.ts` | | ✏️ |
| `apps/web/src/lib/stripe/*` | | ✏️ |

### Phase 4
| File / Package | [4A] | [4B] |
|---------------|------|------|
| `apps/web/src/lib/inngest/*` (NEW) | ✏️ | |
| `apps/web/src/app/api/inngest/*` (NEW) | ✏️ | |
| `apps/web/src/lib/daily-tasks/dispatch.ts` | ✏️ | |
| `packages/types/src/plans.ts` | | ✏️ |
| `packages/types/src/enums.ts` | | ✏️ |
| `packages/queries/src/credits.ts` (NEW) | | ✏️ |
| `apps/web/src/lib/credits/*` (NEW) | | ✏️ |
| `apps/web/src/lib/stripe/*` | | ✏️ |
| `apps/web/src/app/api/webhooks/stripe/*` | | ✏️ |
| `supabase/migrations/015–016` | | ✏️ |

### Phase 6
| File / Package | [6A] | [6B] | [6C] |
|---------------|------|------|------|
| `packages/prompts/` (NEW) | ✏️ | ✏️ | |
| `packages/prompts/reference/*` (pre-built, READ-ONLY) | 📖 | 📖 | |
| `packages/prompts/src/strategy-*` | ✏️ | | |
| `packages/prompts/src/frameworks/*` | ✏️ | | |
| `packages/prompts/src/task-decomposer.ts` | | ✏️ | |
| `apps/web/src/lib/strategy/generate.ts` (NEW) | ✏️ | | |
| `apps/web/src/lib/inngest/functions/strategy-generation.ts` (NEW) | ✏️ | | |
| `apps/web/src/components/strategy/strategy-generator-dialog.tsx` | ✏️ | | |
| `apps/web/src/lib/inngest/functions/task-decomposition.ts` (NEW) | | ✏️ | |
| `apps/web/src/lib/inngest/functions/daily-task-generation.ts` | | ✏️ | |
| `apps/web/src/lib/daily-tasks/generate.ts` (NEW) | | ✏️ | |
| `apps/web/src/components/daily-tasks/generate-tasks-dialog.tsx` (NEW) | | ✏️ | |
| `apps/web/src/components/daily-tasks/tasks-page-client.tsx` | | ✏️ | |
| `packages/types/src/executors.ts` (NEW) | | | ✏️ |
| `packages/types/src/enums.ts` | | | ✏️ (additive) |
| `packages/queries/src/integrations.ts` (NEW) | | | ✏️ |
| `apps/web/src/lib/executors/*` (NEW) | | | ✏️ |
| `apps/web/src/lib/daily-tasks/dispatch.ts` | | | ✏️ |
| `apps/web/src/lib/inngest/functions/executor-dispatch.ts` (NEW) | | | ✏️ |
| `apps/web/src/app/(dashboard)/settings/integrations/page.tsx` | | | ✏️ |
| `apps/web/src/components/settings/*` (NEW) | | | ✏️ |
| `apps/web/src/components/daily-tasks/task-form-dialog.tsx` | | | ✏️ |
| `supabase/migrations/017` | ✏️ | | |
| `supabase/migrations/018` | | ✏️ | |
| `supabase/migrations/019` | | | ✏️ |

---

## Appendix C: Principles Governing This Refactor

1. **Single source of truth** — Types in `packages/types/`, queries in `packages/queries/`, prompts in `packages/prompts/`. If it's used in 2+ places, it lives in a shared package.

2. **Org isolation by construction** — Shared query functions always require `orgId`. Impossible to query without it. RLS is the safety net, not the primary enforcement.

3. **State transitions through functions** — Task status changes go through `transition_task_status()` RPC. No direct UPDATE on status columns. Every transition is logged in `dtn_task_events`.

4. **Durable execution for anything async** — Inngest for: agent execution, task generation, strategy generation, Slack, overdue detection, escalation. No bare `fetch()` for async work.

5. **Reserve → Capture → Refund** — Every AI operation reserves credits first, captures on success, refunds on failure. Prevents overdraft. Enables cost tracking.

6. **Human-in-the-loop by default** — Strategy refinements, blocker resolutions, and content go through the approval queue. Autonomy level is configurable per org.

7. **Feedback closes the loop** — Every task links to a strategy section. Every result updates experiment scores. Every refinement is traceable to data. The system gets smarter.

8. **Tests grow with every phase** — No worktree merges without tests. Unit tests for pure functions, integration tests for queries, E2E for user journeys. Test count never decreases.

9. **Dependency direction is enforced** — `packages/*` never import from `apps/*`. Automated test fails the build if violated. Shared packages are consumed downstream, never upstream.

10. **Executors are pluggable** — Every executor implements `ExecutorDefinition`. New integrations are added by creating a file in `executors/builtin/` — no changes to dispatch logic, registry, or UI rendering. BYOS executors (`category: "byos"`) skip credit deduction; the user pays their provider directly.

---

## Appendix D: User Journey Smoke Tests

Run after every phase merge. Covers three personas:

### Persona 1: New Signup (Gen Marketer)
```
1. Navigate to /signup
2. Enter email, receive magic link, authenticate
3. Complete 3-step onboarding (name → industry → budget)
4. Land on dashboard with Marketing department
5. Navigate to Strategy → see template-generated strategy doc
6. Navigate to Tasks → see daily task list (empty initially; auto-generated after Phase 6)
```
**Pass criteria**: Complete in <3 minutes, no errors, no blank pages.

### Persona 2: Returning User (Daily Execution)
```
1. Navigate to /login, authenticate
2. Land on last-used department dashboard
3. Navigate to Tasks → see today's date selected
4. Create a manual task → see it in list
5. Complete the task → see status update
6. (Phase 7+) Report a blocker → see classification badge
```
**Pass criteria**: Each action reflects in <2 seconds, state persists on refresh.

### Persona 3: Team Lead (Management)
```
1. Authenticate as owner
2. Navigate to Settings → Team
3. Invite a team member → see pending invite
4. Navigate to Approvals → see any pending items
5. Navigate to Pipeline → see engagement metrics
6. (Phase 8+) Navigate to Results → see channel performance
```
**Pass criteria**: All pages load with data or proper empty states, no permission errors.

---

## Appendix E: Pre-Built Reference Materials Index

Non-code content and prompt engineering materials prepared ahead of implementation. These live in the repo and are consumed READ-ONLY during their respective phases.

### Onboarding Strategy Templates (`packages/types/src/templates/`)

| File | Industry | Phase | Status |
|------|----------|-------|--------|
| `b2b-saas-bootstrap.md` | B2B SaaS | [2C] | ✅ Ready |
| `dev-tools-bootstrap.md` | Developer Tools | [2C] | ✅ Ready |
| `dtc-ecommerce-bootstrap.md` | DTC eCommerce | [2C] | ✅ Ready |
| `fintech-bootstrap.md` | Fintech | [2C] | ✅ Ready |
| `marketplace-bootstrap.md` | Marketplace | [2C] | ✅ Ready |
| `healthtech-bootstrap.md` | Healthtech | [2C] | ✅ Ready |
| `other-bootstrap.md` | Other / General | [2C] | ✅ Ready |
| `b2b-saas-growth.md` | B2B SaaS (Growth tier) | [2C], [6A] | ✅ Ready |
| `dtc-ecommerce-growth.md` | DTC eCommerce (Growth tier) | [2C], [6A] | ✅ Ready |

All 9 templates follow GACCS format with Goals, Audience (including Watering holes), Channels (with metrics + budget %), Content (Pillars, Cadence, Formats), Schedule (3 phases × 2 months), and ICE-scored Experiment Backlog (I×C×E, range 1–1000). Bootstrap templates target <$1K/mo; Growth templates target $1K–$10K/mo with attribution models and unit economics.

### Prompt Engineering Reference Materials (`packages/prompts/reference/`)

| File | Description | Consumed By | Phase |
|------|-------------|-------------|-------|
| `gaccs-brief-format.md` | Exact GACCS output schema with validation rules for LLM-generated strategy docs | [6A] strategy-generator.ts | Phase 6 |
| `industry-cac-benchmarks.md` | CAC ranges by industry × channel with budget tier pruning rules | [6A] strategy-generator.ts, [9B] strategy-refiner.ts | Phase 6, 9 |
| `framework-selection-matrix.md` | Decision logic: which frameworks (Bullseye, AARRR, Growth Matrix) apply per industry × budget | [6A] strategy-generator.ts | Phase 6 |
| `strategy-generator-framework-notes.md` | Detailed methodology, prompt fragments, and output schemas for all 5 frameworks | [6A] frameworks/*.ts | Phase 6 |
| `task-decomposer-reference.md` | Day-of-week patterns, carry-over logic, channel balance, executor heuristics, duration estimates | [6B] task-decomposer.ts | Phase 6 |
| `blocker-classifier-corpus.md` | 25 classified blocker examples (5 per type), few-shot template, tiebreaker rules, snapshot test fixtures | [7A] blocker-classifier.ts | Phase 7 |
| `strategy-refiner-reference.md` | Signal thresholds, 6 refinement categories, approval flow, diff-based versioning | [9B] strategy-refiner.ts | Phase 9 |
