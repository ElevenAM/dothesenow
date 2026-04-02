# DoTheseNow.com — Build Progress

## Architecture
- **Stack**: Next.js 16 (App Router) + Supabase + Vercel + Turborepo monorepo
- **UI**: shadcn/ui + Tailwind CSS v4
- **Auth**: Supabase magic link (email OTP)
- **Multi-tenancy**: Shared DB, org_id on every table, RLS isolation
- **Billing**: Stripe (Free / Starter $29 / Pro $79 / Enterprise $199)
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

## Phase 1b: Stripe Billing — NOT STARTED

### Tasks
1. Install Stripe SDK, create products/prices in Stripe Dashboard
2. Checkout flow during onboarding (or upgrade from free)
3. Webhook handler (`/api/webhooks/stripe/route.ts`) with signature verification + idempotency via `dtn_stripe_events` table
4. Stripe Customer Portal integration for self-serve billing
5. Plan enforcement middleware (check `org.plan` + `org.plan_status`)
6. Grace period logic for failed payments (7 days past_due → downgrade to free)

### Deliverable
Full billing lifecycle — subscribe, upgrade, downgrade, payment failure recovery

---

## Phase 2: Team & Permissions — NOT STARTED

### Tasks
1. Team invite system: Owner/Admin can invite via email, invited user joins org
2. Role-based UI: Admin sees settings/team page, Members don't
3. Org switcher: users can belong to multiple orgs
4. Membership-aware RLS policies on all tables (already created in migration, needs testing)
5. Plan-based limits enforcement (member count per plan)

### Deliverable
Invite team members, assign roles, switch between orgs

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
- `src/app/(auth)/callback/route.ts` — auth code exchange
- `src/app/(dashboard)/layout.tsx` — sidebar layout, fetches org/dept
- `src/app/(dashboard)/onboarding/page.tsx` — org creation + dept seeding
- `src/app/(dashboard)/[dept]/page.tsx` — department overview with stats
- `src/components/dashboard/sidebar.tsx` — navigation sidebar

### MCP Server (`packages/mcp-server/`)
- `src/index.ts` — monolithic 21-tool MCP server (to be refactored in Phase 4)
- `.env.example` — SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORG_ID

### Database (`supabase/migrations/`)
- `001_initial_schema.sql` — 11 mktg_* tables, RLS, views, triggers
- `002_multi_tenant.sql` — 9 dtn_* tables, org_id on mktg_*, updated views, member RLS

### Config
- `package.json` — root workspace (npm workspaces + turbo)
- `turbo.json` — build/dev/lint/type-check tasks
- `.gitignore` — node_modules, dist, .next, .env, .vercel
