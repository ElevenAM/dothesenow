# DoTheseNow.com — Build Progress

## Architecture
- **Stack**: Next.js 16 (App Router) + Supabase + Vercel + Turborepo monorepo
- **UI**: shadcn/ui + Tailwind CSS v4
- **Auth**: Supabase magic link (email OTP)
- **Multi-tenancy**: Shared DB, org_id on every table, RLS isolation
- **Billing**: Stripe (Free / Premium $9.99/mo)
- **MCP Server**: 21 existing tools in `packages/mcp-server/`, runs locally via Claude Code/Desktop

## Infrastructure
- **Supabase project**: `ztbsawzahplvvxcgpmiu` (https://ztbsawzahplvvxcgpmiu.supabase.co)
- **GitHub repo**: `ElevenAM/dothesenow` (private)
- **Vercel project**: `web` under `elevenams-projects-85623585`
- **Live URL**: https://web-psi-gilt-20.vercel.app
- **Domain**: dothesenow.com (added to Vercel, **DNS A record needed**: `76.76.21.21`)
- **Publishable key**: `sb_publishable_zuEt24wGCUcfVNIytdRI0Q_PGX0dZTk`

---

## Phase 1a: Scaffold + Auth + Database — COMPLETE

### What was built
1. **Monorepo structure** (Turborepo)
   - `apps/web/` — Next.js 16 app
   - `packages/mcp-server/` — existing MCP server (21 tools, moved from root)
   - `supabase/migrations/` — SQL migration files
   - Root `package.json` with npm workspaces, `turbo.json`

2. **Database** (20 tables total on Supabase)
   - Migration 001: 11 `mktg_*` tables (contacts, outreach_log, campaigns, strategy_docs, competitors, insights, freelancers, tasks, task_submissions, task_messages, weekly_reviews) + 2 views
   - Migration 002: 9 `dtn_*` tables (organizations, memberships, departments, daily_tasks, approval_queue, social_credentials, blog_posts, subscriptions, stripe_events)
   - `org_id` added to all 11 existing `mktg_*` tables (nullable → backfill → NOT NULL pattern)
   - Views updated with `org_id`: `mktg_pipeline_summary`, `mktg_freelancer_leaderboard`, `dtn_daily_tasks_summary`
   - RLS policies: service_role full access + org-member policies on all tables
   - Realtime enabled (`REPLICA IDENTITY FULL`): `dtn_daily_tasks`, `dtn_approval_queue`, `mktg_task_submissions`
   - `updated_at` triggers on all mutable tables

3. **Auth flow**
   - `src/lib/supabase/client.ts` — browser client
   - `src/lib/supabase/server.ts` — server component client
   - `src/lib/supabase/middleware.ts` — session refresh + auth redirect
   - `src/middleware.ts` — Next.js middleware
   - `/login` — magic link sign-in page
   - `/signup` — magic link sign-up page
   - `/callback` — auth code exchange, routes new users to onboarding

4. **Dashboard shell**
   - `(dashboard)/layout.tsx` — sidebar + main content area, fetches org/dept from Supabase
   - `components/dashboard/sidebar.tsx` — client component with nav links, sign out
   - `(dashboard)/page.tsx` — redirects to first department
   - `(dashboard)/onboarding/page.tsx` — create org form, seeds Marketing department, creates owner membership
   - `(dashboard)/[dept]/page.tsx` — department overview with live stats (tasks, contacts, approvals, strategy docs)

5. **Placeholder pages** (all routes wired up, content pending)
   - `[dept]/strategy`, `[dept]/contacts`, `[dept]/tasks`, `[dept]/pipeline`, `[dept]/approvals`, `[dept]/blog`
   - `settings/`, `settings/team`, `settings/billing`, `settings/integrations`

6. **shadcn/ui components installed**
   - Button, Card, Dialog, Table, Tabs, Badge, DropdownMenu, Select, Textarea, Sheet, Separator, Avatar, Input, Label

7. **Deployment**
   - GitHub: initial commit pushed to `ElevenAM/dothesenow`
   - Vercel: deployed to production, env vars configured
   - Domain: `dothesenow.com` + `www.dothesenow.com` added (awaiting DNS)

### DNS — DONE
- [x] A records added for `dothesenow.com` → `76.76.21.21`
- [ ] Add `https://dothesenow.com` and `http://localhost:3000` to Supabase Auth redirect URLs in the dashboard

---

## Phase 1b: Stripe Billing — COMPLETE

### What was built
1. **Simplified plan structure**: 2 tiers (Free + Premium $9.99/mo) instead of original 4-tier
   - Migration `003_simplify_plans.sql` updated CHECK constraint to `('free', 'premium')`
   - Applied to production Supabase

2. **Stripe foundation** (`src/lib/stripe/`)
   - `client.ts` — Server-only Stripe SDK singleton (stripe@21.0.1)
   - `config.ts` — Plan definitions with price IDs, feature limits, plan hierarchy, utility functions (`planFromPriceId`, `canAccessFeature`, `getPlanLimits`, `isPlanActive`, `isInGracePeriod`)

3. **Supabase admin client** (`src/lib/supabase/admin.ts`)
   - Service-role client for webhook handler (bypasses RLS)
   - Uses `SUPABASE_SERVICE_ROLE_KEY` env var

4. **Webhook handler** (`src/app/api/webhooks/stripe/route.ts`)
   - Signature verification with `STRIPE_WEBHOOK_SECRET`
   - Idempotency via `dtn_stripe_events` table (insert-before-process pattern)
   - Handles 5 event types:
     - `checkout.session.completed` → sets org plan + creates subscription record
     - `customer.subscription.updated` → syncs plan/status changes
     - `customer.subscription.deleted` → downgrades to free
     - `invoice.payment_failed` → sets `plan_status = 'past_due'`
     - `invoice.payment_succeeded` → restores `plan_status = 'active'`
   - Adapted for Stripe SDK v21 breaking changes (period dates on subscription items, subscription ID via `invoice.parent.subscription_details`)

5. **Server Actions** (`src/lib/stripe/actions.ts`)
   - `createCheckoutSession(planId)` — authenticates user, verifies owner/admin role, creates/retrieves Stripe customer, creates Checkout Session, redirects to Stripe
   - `createPortalSession()` — creates Stripe Customer Portal session for managing billing

6. **Billing UI** (`src/app/(dashboard)/settings/billing/page.tsx`)
   - Server component showing current plan status with badge
   - Subscription period dates and cancellation info
   - Plan comparison cards (Free vs Premium) with feature lists
   - Upgrade button (client component, triggers checkout)
   - Manage Billing button (client component, opens Stripe portal)
   - Past-due warning banner
   - Role-gated: only owners/admins see upgrade options

7. **Dashboard layout update** (`src/app/(dashboard)/layout.tsx`)
   - Org query now includes `plan` and `plan_status` fields
   - Global past-due warning banner with "Fix billing" link when `plan_status === 'past_due'`

8. **Billing components** (`src/components/billing/`)
   - `upgrade-button.tsx` — Client component with `useTransition` for loading state
   - `manage-billing-button.tsx` — Client component for portal redirect

9. **Grace period**: Stripe-driven (no custom cron). Stripe retries failed payments ~3 times over 7 days. If all retries fail, Stripe cancels → webhook downgrades to free.

### Environment variables added
- `STRIPE_SECRET_KEY` — Stripe live secret key
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — Stripe live publishable key
- `STRIPE_WEBHOOK_SECRET` — Needs value from `stripe listen` or Stripe Dashboard
- `SUPABASE_SERVICE_ROLE_KEY` — For admin Supabase client

### What's still needed
- [ ] Run `stripe listen --forward-to localhost:3000/api/webhooks/stripe` to get webhook secret for local testing
- [ ] Add `STRIPE_WEBHOOK_SECRET` to Vercel env vars after creating webhook endpoint in Stripe Dashboard (point to `https://dothesenow.com/api/webhooks/stripe`)
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` and Stripe keys to Vercel env vars
- [ ] Configure Stripe Customer Portal settings in Stripe Dashboard (allowed actions: cancel, update payment method)
- [ ] Configure Stripe retry settings: Settings → Billing → Subscriptions → "Cancel subscription after all retries fail"
- [ ] End-to-end test: upgrade from free → checkout → verify DB updated → manage billing → cancel → verify downgrade
- [ ] Git push with updated code

---

## Phase 2: Team & Permissions — COMPLETE

### What was built
1. **Migration 004** (`supabase/migrations/004_profiles_and_invite_limit.sql`)
   - `profiles` table (id, email, display_name, avatar_url) with RLS + auth trigger on signup
   - Backfill for existing users
   - `invite_team_member()` DB function — atomic plan limit check + duplicate guard + insert, serialized via `FOR UPDATE`

2. **Shared auth helper** (`src/lib/auth-helpers.ts`)
   - `getAuthenticatedMembership(requiredRoles?)` — single source of truth for auth + org context
   - Reads `dtn_active_org` cookie, validates membership, falls back to first org if stale
   - Returns user, membership, org, and allOrgs array
   - Used by all server actions and server pages

3. **Org context utility** (`src/lib/org-context.ts`)
   - Cookie-based active org management (get/set/clear)
   - `dtn_active_org` cookie, 1-year expiry

4. **Org switcher** (`src/components/dashboard/org-switcher.tsx`)
   - Dropdown in sidebar header showing current org + list of all orgs
   - Single-org mode: static display (no dropdown)
   - Calls `switchOrg()` server action on selection

5. **Org switch action** (`src/lib/org/actions.ts`)
   - `switchOrg(orgId)` — verifies membership, sets cookie, revalidates

6. **Team server actions** (`src/lib/team/actions.ts`)
   - `inviteTeamMember(email, role)` — atomic DB insert via RPC, then Supabase invite email. Rolls back on email failure.
   - `removeTeamMember(membershipId)` — soft-delete active members, hard-delete pending invites. Prevents removing owner.
   - `updateMemberRole(membershipId, role)` — owner-only, can't change owner role
   - `resendInvite(membershipId)` — re-sends invite email, updates invited_at
   - `cancelInvite(membershipId)` — deletes pending invite row

7. **Invite acceptance** (`src/app/(auth)/callback/route.ts`)
   - Atomic UPDATE with `WHERE user_id IS NULL` — idempotent on retry
   - Runs before signup/onboarding checks so invited users skip onboarding
   - Sets active org cookie to first accepted invite's org

8. **Team settings page** (`src/app/(dashboard)/settings/team/page.tsx`)
   - Role-gated: owner/admin only (members see permission error)
   - Members table with profile join (single query, no admin API for emails)
   - Member count vs plan limit indicator
   - Upgrade banner when at free plan limit
   - Empty state for new orgs
   - Expired invite detection (>7 days from invited_at)

9. **Team UI components**
   - `src/components/team/invite-dialog.tsx` — email + role select, disabled at limit
   - `src/components/team/member-actions.tsx` — per-row dropdown: change role, remove, resend/cancel invite

10. **Sidebar updates** (`src/components/dashboard/sidebar.tsx`)
    - Integrated org switcher replacing static org header
    - Role-gated "Team" settings link (owner/admin only)

11. **Dashboard layout updates** (`src/app/(dashboard)/layout.tsx`)
    - Reads `dtn_active_org` cookie, validates membership, falls back to first org
    - Passes `role`, `orgId`, `allOrgs` to sidebar

### Race condition protections
- Invite acceptance: atomic UPDATE with WHERE guards — second click is no-op
- Plan limit enforcement: DB function with `SELECT ... FOR UPDATE` serializes concurrent invites
- Invite email failure: membership row rolled back if `inviteUserByEmail()` fails

### What's still needed
- [ ] End-to-end test: invite → accept → verify membership
- [ ] Verify RLS policies work correctly for cross-org isolation
- [x] DNS A records done (Phase 1a)

---

## Phase 3: Core Views — COMPLETE

### What was built
1. **Migration 005** (`supabase/migrations/005_realtime_and_strategy_versioning.sql`)
   - `REPLICA IDENTITY FULL` on `mktg_strategy_docs`, `mktg_contacts`, `mktg_outreach_log` for Realtime
   - Unique partial index `idx_mktg_strategy_one_active_per_type` — prevents two active docs of same type per org (race condition safety)
   - `update_strategy_doc()` RPC function — atomic versioning with `FOR UPDATE` serialization (deactivate old → insert new version in one transaction)

2. **Strategy page** (`src/app/(dashboard)/[dept]/strategy/page.tsx`)
   - Full markdown editor (`@uiw/react-md-editor`) with live preview
   - Doc cards grid with type filtering via Tabs
   - Create new document dialog (doc_type + title)
   - Version history sidebar (view any previous version)
   - Unsaved changes protection: `beforeunload` warning, dirty-state indicator, Ctrl/Cmd+S shortcut
   - All mutations use atomic `update_strategy_doc()` RPC function
   - Server actions: `getStrategyDocs`, `getStrategyDoc`, `getVersionHistory`, `createStrategyDoc`, `updateStrategyDoc` (`src/lib/strategy/actions.ts`)

3. **Contacts page** (`src/app/(dashboard)/[dept]/contacts/page.tsx`)
   - Server-side paginated table (20 per page) with exact count
   - URL-based filter state (shareable/bookmarkable): search, type, status, lifecycle_stage, page
   - Debounced search input (400ms) to avoid hammering server
   - Contact detail Sheet (slide-over) with full info + outreach timeline
   - Add contact dialog (first name, last name, email, company, type, notes)
   - Outreach timeline component showing chronological history with channel icons and status badges
   - Server actions: `searchContacts`, `getContact`, `getOutreachHistory`, `createContact`, `updateContact` (`src/lib/contacts/actions.ts`)

4. **Pipeline page** (`src/app/(dashboard)/[dept]/pipeline/page.tsx`)
   - Engagement metric cards (Total Active, Engaged 7d/30d, Avg Lead Score)
   - Horizontal bar chart (recharts) showing contacts by lifecycle stage
   - Detailed breakdown table by contact type × stage
   - Empty state with link to contacts page for new orgs

5. **Activity feed** (`src/components/dashboard/activity-feed.tsx`)
   - Combined recent activity from outreach, strategy docs, and contacts
   - Parallel queries (5 each), merged and sorted by timestamp, top 10 shown
   - Relative time formatting (just now, 5m ago, 3h ago, 2d ago)
   - Replaced "Getting Started" card on department overview

6. **Realtime listener** (`src/components/realtime-listener.tsx`)
   - Client component subscribing to Supabase Realtime postgres_changes
   - Org-scoped filter: `org_id=eq.${orgId}` (no cross-org noise)
   - Triggers `router.refresh()` on INSERT/UPDATE/DELETE → server components re-render
   - Applied to strategy and contacts pages

### New dependencies
- `@uiw/react-md-editor` — Markdown editor with preview
- `recharts` — Chart library for pipeline visualization

### Race condition protections
- Strategy versioning: `update_strategy_doc()` RPC with `FOR UPDATE` lock + unique partial index
- Realtime: org-scoped subscription filter prevents cross-org data leakage

### New files (16)
```
src/lib/strategy/actions.ts
src/lib/contacts/actions.ts
src/components/strategy/doc-list.tsx
src/components/strategy/doc-editor.tsx
src/components/strategy/version-history.tsx
src/components/strategy/create-doc-dialog.tsx
src/components/contacts/contacts-page-client.tsx
src/components/contacts/contacts-table.tsx
src/components/contacts/contacts-filters.tsx
src/components/contacts/contact-sheet.tsx
src/components/contacts/contact-form.tsx
src/components/contacts/outreach-timeline.tsx
src/components/pipeline/pipeline-funnel.tsx
src/components/pipeline/engagement-cards.tsx
src/components/dashboard/activity-feed.tsx
src/components/realtime-listener.tsx
supabase/migrations/005_realtime_and_strategy_versioning.sql
```

### What's still needed
- [ ] End-to-end test: create strategy doc → edit → verify version history
- [ ] End-to-end test: add contact → search → filter → open detail sheet
- [ ] Verify realtime works across two browser tabs
- [ ] Git push with Phase 3 code
- [x] DNS A records done (Phase 1a)

---

## Phase 4: Daily Tasks + MCP Refactor — COMPLETE

### What was built

1. **MCP Server refactor** — split 750-line monolithic `index.ts` into modular architecture:
   - `src/lib/supabase.ts` — `OrgScopedClient` wrapper with `createOrgClient(orgId?)` factory
   - `src/tools/types.ts` — shared `ToolDefinition`, `ToolModule`, `ToolResult`, `ToolHandler` types
   - `src/tools/registry.ts` — tool registration + dispatch (resolves org_id from arg or env)
   - `src/tools/crm.ts` — 6 CRM tools (search_contacts, add_contact, update_contact, log_outreach, get_outreach_history, get_pipeline_summary)
   - `src/tools/strategy.ts` — 6 strategy tools (get_strategy_doc, update_strategy_doc, search_strategy, get_competitors, update_competitor, log_insight)
   - `src/tools/marketplace.ts` — 5 marketplace tools (create_task, list_tasks, review_submission, get_freelancer_leaderboard, send_task_message)
   - `src/tools/campaigns.ts` — 2 campaign tools (create_campaign, create_weekly_review)
   - `src/tools/daily-tasks.ts` — 5 NEW daily task tools (see below)
   - `src/index.ts` — slim 28-line entry point (server setup + registry import)

2. **Org_id tenant isolation on all 24 tools** — every query includes `.eq('org_id', client.orgId)`, every insert includes `org_id: client.orgId`. The `org_id` parameter is optional on all tools (falls back to `ORG_ID` env var).

3. **5 new MCP daily task tools**:
   - `get_daily_tasks` — filter by date, executor_type, status, assigned_to, priority
   - `create_daily_task` — insert with org_id, sets `generated_by: 'claude'`
   - `update_daily_task` — update by id scoped to org, auto-sets `completed_at` on completion
   - `generate_daily_tasks` — returns structured context (strategies + yesterday's outcomes + suggested focus) for Claude Desktop to reason over
   - `carry_over_tasks` — atomic UPDATE→INSERT: marks originals as carried_over, creates copies for today

4. **Daily tasks web UI** (`apps/web/`):
   - Server page: `[dept]/tasks/page.tsx` with RealtimeListener, parallel data fetching
   - Server actions: `src/lib/daily-tasks/actions.ts` (getDailyTasks, getDailyTasksSummary, createDailyTask, updateDailyTask, completeDailyTask, skipDailyTask, carryOverTasks, getTeamMembers)
   - Client components:
     - `tasks-page-client.tsx` — main wrapper with executor-type tabs, carry-over button
     - `date-picker.tsx` — Calendar+Popover, arrow navigation, URL-driven `?date=YYYY-MM-DD`
     - `task-list.tsx` — task rows with checkbox completion, priority/status badges, action dropdown
     - `task-form-dialog.tsx` — create/edit dialog with assignment section (self/teammate/n8n/claude_api/freelancer)
     - `summary-cards.tsx` — per-executor-type completion stats
     - `task-detail-sheet.tsx` — slide-over with full task details

5. **shadcn/ui components added**: Calendar, Popover, Checkbox (base-ui/react)

6. **Tenant isolation test suite** (`packages/mcp-server/src/__tests__/tenant-isolation.test.ts`)
   - Tests CRM, Strategy, Marketplace, Campaigns, Daily Tasks modules
   - Two test org UUIDs, verifies cross-org reads return zero, writes set correct org_id
   - Uses vitest, runs against local Supabase (`supabase start`)

### Race condition protections
- Strategy versioning: relies on unique partial index `idx_mktg_strategy_one_active_per_type` — concurrent MCP updates fail cleanly
- Carry-over: atomic UPDATE RETURNING→INSERT pattern prevents duplicate copies on double-click/race
- `review_submission`: flagged as tech debt (3 sequential writes without transaction), to be fixed in Phase 5

### New dependencies
- `vitest` — test framework for MCP server

### New files (17)
```
packages/mcp-server/src/lib/supabase.ts
packages/mcp-server/src/tools/types.ts
packages/mcp-server/src/tools/registry.ts
packages/mcp-server/src/tools/crm.ts
packages/mcp-server/src/tools/strategy.ts
packages/mcp-server/src/tools/marketplace.ts
packages/mcp-server/src/tools/campaigns.ts
packages/mcp-server/src/tools/daily-tasks.ts
packages/mcp-server/src/__tests__/tenant-isolation.test.ts
apps/web/src/lib/daily-tasks/actions.ts
apps/web/src/components/daily-tasks/tasks-page-client.tsx
apps/web/src/components/daily-tasks/date-picker.tsx
apps/web/src/components/daily-tasks/task-list.tsx
apps/web/src/components/daily-tasks/task-form-dialog.tsx
apps/web/src/components/daily-tasks/summary-cards.tsx
apps/web/src/components/daily-tasks/task-detail-sheet.tsx
apps/web/src/components/ui/{calendar,popover,checkbox}.tsx (auto-generated)
```

### What's still needed
- [ ] Run tenant isolation tests against local Supabase (`supabase start && cd packages/mcp-server && npm test`)
- [ ] End-to-end test: create task in web → verify via MCP `get_daily_tasks`
- [ ] End-to-end test: create task via MCP → verify appears in web UI
- [ ] Verify profile joins work (may need FK relationship definition or manual join)
- [ ] Test carry-over flow: create tasks yesterday → carry over → verify copies
- [ ] Git push with Phase 4 code
- [x] DNS A records done (Phase 1a)

---

## Phase 5: Automations & Approvals — NOT STARTED

### Tasks
1. n8n executor: fire webhook on task creation, `/api/webhooks/n8n/route.ts` callback handler
2. Claude API executor: Supabase Edge Function reads task + strategy context, calls Anthropic API
3. Approval queue page: cards for pending content, approve/reject/request-revision actions
4. MCP tools: `submit_for_approval`, `list_pending_approvals`, `review_approval`

### Deliverable
Automated task execution with human-in-the-loop approval

---

## Phase 6: Social Creds, Blog, Polish — NOT STARTED

### Tasks
1. Enable Supabase Vault (pgsodium) for credential encryption
2. Social credentials management page — store via Vault secrets, enforce sharing rules server-side
3. Blog post CRUD pages + MCP tools (`create_blog_post`, `update_blog_post`, `list_blog_posts`, `publish_blog_post`)
4. Daily task auto-generation via pg_cron (runs at 7am, reads strategy + yesterday's outcomes)
5. Command palette (Cmd+K), mobile responsive sidebar, empty states
6. Onboarding improvements

### Deliverable
Production-ready platform

---

## Key Files Reference

### Web App (`apps/web/`)
- `src/middleware.ts` — auth session refresh + redirect
- `src/lib/supabase/{client,server,middleware}.ts` — Supabase utilities
- `src/lib/supabase/admin.ts` — Service-role client (bypasses RLS)
- `src/lib/auth-helpers.ts` — Shared auth + org context helper (`getAuthenticatedMembership`)
- `src/lib/org-context.ts` — Cookie-based active org management
- `src/app/(auth)/login/page.tsx` — magic link login
- `src/app/(auth)/signup/page.tsx` — magic link signup
- `src/app/(auth)/callback/route.ts` — auth code exchange + invite acceptance
- `src/app/(dashboard)/layout.tsx` — sidebar layout, org cookie, fetches org/dept
- `src/app/(dashboard)/onboarding/page.tsx` — org creation + dept seeding
- `src/app/(dashboard)/[dept]/page.tsx` — department overview with stats + activity feed
- `src/app/(dashboard)/[dept]/strategy/page.tsx` — strategy doc editor with version history
- `src/app/(dashboard)/[dept]/contacts/page.tsx` — paginated contacts table with filters
- `src/app/(dashboard)/[dept]/pipeline/page.tsx` — pipeline funnel chart + engagement metrics
- `src/app/(dashboard)/settings/team/page.tsx` — team management (members table, invites)
- `src/components/dashboard/sidebar.tsx` — navigation sidebar with org switcher + role gating
- `src/components/dashboard/org-switcher.tsx` — org dropdown switcher
- `src/components/dashboard/activity-feed.tsx` — combined recent activity feed
- `src/components/strategy/{doc-list,doc-editor,version-history,create-doc-dialog}.tsx`
- `src/components/contacts/{contacts-page-client,contacts-table,contacts-filters,contact-sheet,contact-form,outreach-timeline}.tsx`
- `src/components/pipeline/{pipeline-funnel,engagement-cards}.tsx`
- `src/components/realtime-listener.tsx` — org-scoped Supabase Realtime subscription
- `src/components/team/invite-dialog.tsx` — invite member dialog
- `src/components/team/member-actions.tsx` — per-member action dropdown

### Daily Tasks (`apps/web/src/lib/daily-tasks/`)
- `actions.ts` — getDailyTasks, getDailyTasksSummary, createDailyTask, updateDailyTask, completeDailyTask, skipDailyTask, carryOverTasks, getTeamMembers

### Daily Tasks UI (`apps/web/src/components/daily-tasks/`)
- `tasks-page-client.tsx` — main wrapper with executor tabs + carry-over
- `date-picker.tsx` — Calendar+Popover date navigation
- `task-list.tsx` — task rows with checkbox, badges, actions dropdown
- `task-form-dialog.tsx` — create/edit dialog with assignment
- `summary-cards.tsx` — per-executor completion stats
- `task-detail-sheet.tsx` — detail slide-over

### MCP Server (`packages/mcp-server/`)
- `src/index.ts` — slim entry point (28 lines, delegates to registry)
- `src/lib/supabase.ts` — OrgScopedClient wrapper + createOrgClient factory
- `src/tools/registry.ts` — tool registration + dispatch
- `src/tools/types.ts` — shared ToolDefinition, ToolModule, ToolResult types
- `src/tools/crm.ts` — 6 CRM tools (org-scoped)
- `src/tools/strategy.ts` — 6 strategy tools (org-scoped)
- `src/tools/marketplace.ts` — 5 marketplace tools (org-scoped)
- `src/tools/campaigns.ts` — 2 campaign tools (org-scoped)
- `src/tools/daily-tasks.ts` — 5 daily task tools (org-scoped)
- `src/__tests__/tenant-isolation.test.ts` — cross-org isolation tests
- `.env.example` — SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORG_ID

### Stripe Billing (`apps/web/src/lib/stripe/`)
- `client.ts` — Server-only Stripe SDK singleton
- `config.ts` — Plan definitions, price IDs, feature limits, utility functions
- `actions.ts` — Server Actions: createCheckoutSession, createPortalSession

### Billing UI (`apps/web/src/components/billing/`)
- `upgrade-button.tsx` — Client component for checkout redirect
- `manage-billing-button.tsx` — Client component for Stripe portal redirect

### Strategy & Contacts Actions (`apps/web/src/lib/`)
- `strategy/actions.ts` — getStrategyDocs, getStrategyDoc, getVersionHistory, createStrategyDoc, updateStrategyDoc
- `contacts/actions.ts` — searchContacts, getContact, getOutreachHistory, createContact, updateContact

### Team & Org Actions (`apps/web/src/lib/`)
- `org/actions.ts` — switchOrg server action
- `team/actions.ts` — inviteTeamMember, removeTeamMember, updateMemberRole, resendInvite, cancelInvite

### Webhook (`apps/web/src/app/api/webhooks/stripe/`)
- `route.ts` — Stripe webhook POST handler with signature verification + idempotency

### Database (`supabase/migrations/`)
- `001_initial_schema.sql` — 11 mktg_* tables, RLS, views, triggers
- `002_multi_tenant.sql` — 9 dtn_* tables, org_id on mktg_*, updated views, member RLS
- `003_simplify_plans.sql` — Update plan CHECK constraint to ('free', 'premium')
- `004_profiles_and_invite_limit.sql` — profiles table, auth trigger, invite_team_member() function
- `005_realtime_and_strategy_versioning.sql` — realtime identity, unique active doc index, update_strategy_doc() RPC

### Config
- `package.json` — root workspace (npm workspaces + turbo)
- `turbo.json` — build/dev/lint/type-check tasks
- `.gitignore` — node_modules, dist, .next, .env, .vercel
