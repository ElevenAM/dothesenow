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

### DNS Action Required
Add these A records in AWS Route 53 for `dothesenow.com`:
- `dothesenow.com` → `76.76.21.21`
- `www.dothesenow.com` → `76.76.21.21`

Also add `https://dothesenow.com` and `http://localhost:3000` to Supabase Auth redirect URLs in the dashboard.

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
1. **Migration `004_team_invites.sql`**
   - Partial index on `invited_email` for pending invite lookups
   - Unique partial index on `(org_id, invited_email)` preventing duplicate pending invites
   - `check_and_insert_invite()` PL/pgSQL function — atomic plan limit check + invite insertion (uses `SELECT ... FOR UPDATE` on org row)
   - `check_and_accept_invite()` PL/pgSQL function — atomic email verification + plan limit re-check + invite acceptance

2. **Server actions** (`src/lib/team/actions.ts`)
   - `inviteTeamMember(email, role)` — Owner/admin only, calls atomic RPC
   - `acceptInvite(membershipId)` — Authenticated user, calls atomic RPC with email verification
   - `declineInvite(membershipId)` — Email-verified decline, deletes invite row
   - `removeMember(membershipId)` — Owner/admin only, last-owner protection, soft-delete
   - `updateMemberRole(membershipId, newRole)` — Owner only, last-owner protection
   - `cancelInvite(membershipId)` — Owner/admin only, deletes pending invite
   - `switchOrg(orgId)` — Sets httpOnly cookie, validates membership
   - All actions return `{ error: string } | { success: true }` pattern

3. **Query helpers** (`src/lib/team/queries.ts`)
   - `getOrgMembers(orgId)` — Active members with emails from auth.users
   - `getPendingInvites(orgId)` — Pending invites for an org
   - `getPendingInvitesForUser(email)` — Cross-org pending invites for a user
   - `getMemberCount(orgId)` — Active + pending count for limit checks

4. **Team settings page** (`/settings/team`)
   - Role-gated: members see "no permission" message, owners/admins see full UI
   - Member count vs plan limit display
   - Invite form with email + role selector, plan limit warnings
   - Members table with role badges, role change/remove actions (dropdown)
   - Pending invites table with cancel buttons

5. **Invite acceptance flow**
   - Dashboard layout shows blue invite banner when pending invites exist
   - `/invites` page lists all pending invites with accept/decline buttons
   - Auth callback redirects to `/invites` if user has no org but has pending invites

6. **Org switcher**
   - Sidebar dropdown appears when user has multiple orgs
   - Cookie-based org selection (`dtn_current_org`, httpOnly)
   - Layout validates cookie against active memberships, falls back to first org

7. **Plan limit enforcement**
   - Free plan: 2 members max (active + pending)
   - Premium plan: unlimited
   - Double-gate: checked at invite time AND acceptance time
   - Atomic via PL/pgSQL `FOR UPDATE` locks — prevents concurrent bypass

### Components created
- `src/components/team/invite-form.tsx` — Invite form with error/success states
- `src/components/team/member-actions.tsx` — Role change + remove dropdown
- `src/components/team/cancel-invite-button.tsx` — Cancel pending invite
- `src/components/team/invite-actions.tsx` — Accept/decline invite buttons

### What's still needed
- [ ] Apply migration `004_team_invites.sql` to production Supabase
- [ ] End-to-end test: invite → accept → verify membership
- [ ] Test plan limit enforcement (free plan: invite 3rd member should fail)
- [ ] Test org switcher with multiple orgs
- [ ] Membership-aware RLS policies testing (already created in migration 002)

---

## Phase 3: Core Views — NOT STARTED

### Tasks
1. Strategy doc editor — markdown editor, read/write `mktg_strategy_docs` scoped to org, version history
2. Contacts table — server-side paginated, filterable by type/status/tags, detail view + outreach history
3. Pipeline summary — chart from `mktg_pipeline_summary` view, engagement metrics
4. Department overview dashboard (partially done — stats cards exist, needs activity feed)
5. Supabase Realtime subscriptions in web app for live updates

### Deliverable
All existing MCP data visible and editable in the web app, with live updates

---

## Phase 4: Daily Tasks + MCP Refactor — NOT STARTED

### Tasks
1. Daily tasks page: date picker, task list grouped by executor_type, add/edit/complete
2. Task assignment dialog: assign to self, teammate, n8n, Claude API, or freelancer
3. Build `OrgScopedClient` wrapper in MCP server (`packages/mcp-server/src/lib/supabase.ts`)
4. Refactor all 21 existing MCP tools to use org-scoped client
5. Add per-request `org_id` parameter to all tools (falls back to env default)
6. New MCP tools: `get_daily_tasks`, `create_daily_task`, `update_daily_task`, `generate_daily_tasks`, `carry_over_tasks`
7. Write automated tenant isolation tests for every MCP tool
8. Split monolithic `index.ts` into modular tool files: `tools/crm.ts`, `tools/strategy.ts`, `tools/marketplace.ts`, `tools/daily-tasks.ts`, `tools/blog.ts`, `tools/approvals.ts`

### Deliverable
Full daily task loop — create/assign/complete from web or Claude. Tenant isolation verified.

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
- `src/app/(auth)/login/page.tsx` — magic link login
- `src/app/(auth)/signup/page.tsx` — magic link signup
- `src/app/(auth)/callback/route.ts` — auth code exchange + pending invite detection
- `src/app/(dashboard)/layout.tsx` — sidebar layout, org switching, invite banner
- `src/app/(dashboard)/onboarding/page.tsx` — org creation + dept seeding
- `src/app/(dashboard)/invites/page.tsx` — pending invite list with accept/decline
- `src/app/(dashboard)/[dept]/page.tsx` — department overview with stats
- `src/components/dashboard/sidebar.tsx` — navigation sidebar with org switcher

### MCP Server (`packages/mcp-server/`)
- `src/index.ts` — monolithic 21-tool MCP server (to be refactored in Phase 4)
- `.env.example` — SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORG_ID

### Stripe Billing (`apps/web/src/lib/stripe/`)
- `client.ts` — Server-only Stripe SDK singleton
- `config.ts` — Plan definitions, price IDs, feature limits, utility functions
- `actions.ts` — Server Actions: createCheckoutSession, createPortalSession

### Billing UI (`apps/web/src/components/billing/`)
- `upgrade-button.tsx` — Client component for checkout redirect
- `manage-billing-button.tsx` — Client component for Stripe portal redirect

### Team & Permissions (`apps/web/src/lib/team/`)
- `actions.ts` — Server Actions: invite, accept, decline, remove, role change, cancel, switch org
- `queries.ts` — Query helpers: getOrgMembers, getPendingInvites, getMemberCount

### Team UI (`apps/web/src/components/team/`)
- `invite-form.tsx` — Email + role invite form with plan limit warnings
- `member-actions.tsx` — Role change + remove dropdown
- `cancel-invite-button.tsx` — Cancel pending invite
- `invite-actions.tsx` — Accept/decline invite buttons

### Supabase Admin (`apps/web/src/lib/supabase/`)
- `admin.ts` — Service-role client for webhook handler (bypasses RLS)

### Webhook (`apps/web/src/app/api/webhooks/stripe/`)
- `route.ts` — Stripe webhook POST handler with signature verification + idempotency

### Database (`supabase/migrations/`)
- `001_initial_schema.sql` — 11 mktg_* tables, RLS, views, triggers
- `002_multi_tenant.sql` — 9 dtn_* tables, org_id on mktg_*, updated views, member RLS
- `003_simplify_plans.sql` — Update plan CHECK constraint to ('free', 'premium')
- `004_team_invites.sql` — Invite indexes, atomic limit-check PL/pgSQL functions

### Config
- `package.json` — root workspace (npm workspaces + turbo)
- `turbo.json` — build/dev/lint/type-check tasks
- `.gitignore` — node_modules, dist, .next, .env, .vercel
