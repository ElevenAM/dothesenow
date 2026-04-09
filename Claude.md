# [Project Name] — Claude Code Instructions

> **Copy this file to `CLAUDE.md` at your project root and customize the bracketed sections.**
> Remove this instruction block once configured.

---

## Test Accounts

> **ACTION REQUIRED**: Add test credentials here so Claude can verify changes across environments.

- **Supabase Dashboard**: [URL] — project ref: `[your-project-ref]`
- **Vercel Dashboard**: [URL] — team: `[your-team]`

### Dev Auto-Login (local development only)

The app uses magic link (OTP) auth, which blocks automated testing. A dev-only bypass route exists:

```
GET /api/dev/login?email=user@example.com
```

- Returns 404 in production (`NODE_ENV !== 'development'` guard)
- Generates a magic link token server-side via admin API (no email sent)
- Verifies the token to establish a real cookie-based session
- Redirects to `/` (or `/onboarding` if user has no org, `/invites` if pending invite)
- If the user doesn't exist yet, Supabase creates them automatically

**Usage from Claude**: Navigate to `http://localhost:3000/api/dev/login?email=liamnguyen.mail@gmail.com` to authenticate.

**Usage in E2E tests**: `global-setup.ts` calls this route automatically — just set `TEST_USER_EMAIL` in `.env.test`.

**Login page**: In dev mode, a "Dev Auto-Login" panel appears below the login form for quick manual testing.

---

## Session Workflow Rules

**At the end of every session (or when significant work is completed), you MUST:**

1. **Update `PROGRESS.md`** — Reflect all changes made during the session. Mark completed items with `[x]`, add new items discovered, and move anything that changed status. Keep any quick-reference tables accurate.
2. **Log high-impact remaining work** — At the end of each updated section, explicitly list the highest-priority next steps so the next session can pick up seamlessly. Use a "What's Still Missing" or "Next Steps" subsection.
3. **Never leave `PROGRESS.md` stale** — If you built it, shipped it, wired it, or fixed it, it must be reflected in `PROGRESS.md` before the session ends. This is the single source of truth for build state.

> **First session**: If `PROGRESS.md` doesn't exist yet, create it with this structure:
> ```markdown
> # [Project Name] — Build Progress
>
> > **Status**: [One-line summary of current state]
> >
> > Last updated: [Date]
>
> ---
>
> ## Architecture Overview (What's Built)
>
> ### Infrastructure
> - **Monorepo**: [Turborepo/Nx] + [pnpm/yarn] workspaces
> - **Database**: [Supabase/other] with [N] migrations
> - **Deployments**: [List platforms]
>
> ### [App 1] (`apps/[name]/`)
> - [Status of each major feature area]
>
> ### [App 2] (`apps/[name]/`)
> - [Status of each major feature area]
>
> ---
>
> ## What's Next
> - [ ] [Priority items]
> ```

---

## Development Phases & Review Gates

Follow this phased approach for all non-trivial work. Each phase has a review gate before proceeding.

### Phase 1: Plan
1. Understand the request — read relevant code, explore the codebase
2. Write a plan (use Claude Code plan mode or describe the approach)
3. **Review gate**: Get user approval on the plan before writing code. Call out:
   - Files to create/modify
   - Dependencies or migrations needed
   - Risks or trade-offs
   - Estimated scope (small/medium/large)

### Phase 2: Implement
1. Execute the approved plan
2. Follow all code quality standards below
3. Update `PROGRESS.md` as you complete milestones

### Phase 3: Verify & Review
1. Run tests / build checks
2. **Review gate**: After implementation, do a self-review:
   - Check for unused imports, dead code, console.logs left behind
   - Verify error handling at system boundaries
   - Confirm naming conventions are followed
   - Ensure no security vulnerabilities (injection, XSS, etc.)
3. Surface any deviations from the plan to the user

### Phase 4: Deploy (when applicable)
1. Check for unapplied migrations
2. Check for undeployed functions
3. Surface findings before pushing — never push without confirming

---

## Project Setup Guide

> **For new projects**: Follow these steps to bootstrap the monorepo. Skip sections that are already complete.

### 1. Monorepo Scaffold

```
[project-name]/
├── apps/
│   ├── web/                 # Next.js marketing site or main web app
│   ├── portal/              # Admin/dashboard (Next.js or React)
│   └── mobile/              # Expo/React Native (if applicable)
├── packages/
│   ├── shared/              # Shared types, utils, constants, design tokens
│   └── [domain-package]/    # Domain-specific shared logic
├── supabase/
│   ├── migrations/          # Database schema migrations
│   ├── functions/           # Deno edge functions
│   └── seed.sql             # Seed data (with prod safety guard)
├── package.json             # Monorepo root
├── turbo.json               # Turborepo pipeline config
├── pnpm-workspace.yaml      # Workspace definitions
├── CLAUDE.md                # This file
└── PROGRESS.md              # Build progress tracker
```

**Ask the user**:
- Which apps do you need? (web, portal/admin, mobile)
- Package manager preference? (pnpm recommended for monorepos)
- What is the project name and package scope? (e.g., `@myapp/*`)

### 2. Supabase Setup

**Ask the user for**:
- Supabase project ref (from dashboard URL: `https://supabase.com/dashboard/project/[ref]`)
- Whether `supabase db push` works from their machine (if not, use Management API — see §5a)
- Auth providers needed (email, Google, Apple, etc.)

**Key setup steps**:
1. `supabase init` in project root (if not done)
2. `supabase link --project-ref [ref]`
3. Set secrets: `supabase secrets set KEY=value`
4. Create initial migration for auth triggers and base tables
5. Enable Row Level Security (RLS) on every table from day one

### 3. Vercel Setup

**Ask the user for**:
- Vercel team/account
- Custom domains for each app
- Environment variables needed

**Key setup steps**:
1. Connect Git repo to Vercel
2. Configure each app as a separate Vercel project with correct root directory
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars
4. Configure build settings (framework preset, build command, output directory)

### 4. Shared Package Setup

Create `packages/shared/` with:
- `src/theme/colors.ts` — Single source of truth for all colors
- `src/constants/` — Validation constants, API limits, magic numbers
- `src/types/` — Shared TypeScript types
- `src/utils/` — Shared utility functions

**Rule**: All apps import design tokens and shared logic from this package. Never hardcode values that belong in shared.

---

## Code Quality Standards

These rules prevent the most common categories of technical debt. Follow them for every code change.

### 1. Use Existing Shared Utilities — Never Duplicate Logic

Before writing any helper, formatter, mapper, or utility function:
1. Search the codebase for existing implementations
2. If one exists, import it
3. If it doesn't quite fit, extend the existing one — don't create a parallel version

Maintain a utilities table in this section as shared helpers are created:

| Need | Use This | Location |
|------|----------|----------|
| [e.g., Get current user ID] | `[functionName]()` | `[file path]` |
| [e.g., Format dates] | `[functionName]()` | `[file path]` |

> **Update this table** as new shared utilities are created during development.

### 2. State Management Conventions

- **Loading state**: Always use `isLoading` as the field name, never `loading`
- **No derived state as stored fields** — If a value can be computed from other state, expose it as a selector/computed, not a stored field
- **Separate UI state from domain state** — Ephemeral UI state (expanded/collapsed, animations, toggles) should live in component-local state, not in global stores
- **Name methods honestly** — If a method writes to a remote DB, prefix with `update` or `sync`, not `set`. Reserve `set` for purely local state changes
- **Remove dead code immediately** — If a store action or function is no longer called, delete it

### 3. Naming Standards

- **Callback parameters**: Use descriptive names, not single letters (`userRow` not `u`, `itemData` not `d`)
- **Constants over magic numbers**: Extract numeric literals to named constants at module level
- **No `any` type assertions on DB rows**: Use properly typed interfaces or mapper functions

### 4. Error Handling

- **`console.error` for failures**, `console.warn` only for degraded-but-functional states
- **Always surface errors to the user** — If a fetch or mutation fails and the user should know, set an `error` state. Don't fail silently
- **Never silently skip on missing data** — If a value you need is null, alert the user or set error state. An `if (value) { ... }` without an `else` is a silent failure
- **Validate at system boundaries** — User input, external APIs, DB responses. Trust internal code

### 5. Supabase Best Practices

#### Auth & Edge Functions
- **Always use `supabase.auth.getSession()`** before calling `supabase.functions.invoke()` — never `refreshSession()`. The client's `autoRefreshToken` handles freshness
- **Deploy edge functions with `--no-verify-jwt`** if your functions handle auth internally (recommended pattern: check Authorization header → `supabase.auth.getUser()`)
- **Edge functions use dual clients**: user-scoped (from auth header) for reads + admin (service role key) for privileged writes

#### Schema Safety
- **Verify `.select()` columns against actual schema** — PostgREST silently returns `null` for non-existent columns. This causes authorization checks and lookups to fail in misleading ways
- **Verify `.insert()` values against NOT NULL constraints** — Passing `NULL` to a `NOT NULL` column raises an exception that rolls back the entire transaction
- **Test mocks must match real schema** — Only include columns that exist on the actual table. A passing test with fake columns hides production bugs
- **Triggers must read from metadata, not hardcode values** — Auth triggers should read `NEW.raw_user_meta_data` for signup form values

#### Database Operations (if `supabase db push` doesn't work)
```bash
# Run SQL against production via Management API
ACCESS_TOKEN=$(cat ~/.supabase/access-token) && curl -s -X POST \
  "https://api.supabase.com/v1/projects/[PROJECT_REF]/database/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "YOUR SQL HERE"}'
```

- Write migrations to `supabase/migrations/` for version control, apply via Management API or Dashboard SQL Editor
- Always enable RLS on new tables. No exceptions.

### 6. Next.js Rules (v14+/v15)

- **`useSearchParams()` requires a Suspense boundary** — Wrap the consuming component in `<Suspense>`. Pattern: default export renders `<Suspense><InnerComponent /></Suspense>`, inner component calls `useSearchParams()`
- **Server Components by default** — Only add `'use client'` when you need interactivity, hooks, or browser APIs
- **Route groups** for shared layouts — Use `(auth)`, `(dashboard)`, etc.
- **Environment variables**: `NEXT_PUBLIC_*` for client-side, plain names for server-side only

### 7. React Native / Expo Rules (if applicable)

- **Always run `pnpm install` before starting a fresh dev server** — Workspace symlinks must be intact for shared package resolution
- **Don't clear `.expo/` or Metro cache while a dev server is running**
- **Reuse the running dev server** — Prefer reusing over stop/start cycles
- **Safe area handling** — Use safe area insets consistently on all screens, including auth screens

### 8. Cross-App Single Source of Truth

- **Colors**: All app Tailwind/theme configs must import from the shared package — never hardcode hex values
- **Design system**: All UI components MUST follow `DESIGN.md` (GitHub Primer spec) for colors, typography, spacing, shadows, border radius, motion, and accessibility. See §10 below.
- **Validation constants**: Shared between all apps and edge functions via `packages/shared/`
- **Types**: Entity types used by multiple apps must be defined once in `packages/shared/src/types/`
- **Edge functions can't import workspace packages** (Deno limitation) — Keep synced copies or use a build step

### 9. Component Architecture

- **Don't re-fetch data the parent already has** — Pass data via props, don't make independent API calls from child components
- **Demo/mock data lives in a shared location** — Never define mock data inline in view components
- **Types live in a shared location** — Entity types used by multiple components must be defined once, not redeclared locally
- **Follow `DESIGN.md`** — When creating or modifying any UI component, consult `DESIGN.md` for correct colors, spacing, radius, shadows, typography, and interaction states

### 10. Design System (`DESIGN.md`)

All UI work MUST follow the GitHub Primer design system defined in `DESIGN.md` at the project root. Key rules:

- **Never hardcode Tailwind palette colors** — No `bg-red-100`, `text-blue-600`, `bg-gray-50`, etc. Use CSS variable tokens defined in `globals.css` (e.g., `bg-muted`, `text-destructive`, `bg-[var(--label-danger-bg)]`)
- **Colors come from Primer** — Primary button = green (`#1f883d`), accent/links/focus = blue (`#0969da`), danger = red (`#d1242f`), success = green (`#1a7f37`)
- **Border radius** — 6px (`rounded-md`) for buttons, inputs, cards. 12px (`rounded-lg`) for modals/dialogs only
- **Shadows** — Use Primer shadow tokens (`--shadow-resting-small`, `--shadow-floating-medium`, etc.), not `ring-*` utilities for elevation
- **Typography** — System font stack (no Geist). See `DESIGN.md` §2 for the full type scale
- **Focus states** — 2px solid blue (`#0969da`) with -2px offset. Not ring-based
- **Motion** — 150ms (fast), 200ms (normal), 300ms (slow). Always include `prefers-reduced-motion` handling
- **Accessibility** — WCAG AA contrast (4.5:1 body text, 3:1 UI components). All interactive elements need visible focus indicators and keyboard support
- **Status/label colors** — Use the 7 Primer semantic label pairs (blue, green, red, yellow, orange, purple, gray) via CSS variables, not hardcoded Tailwind colors
- **Consult `DESIGN.md`** for the full spec before making any visual change

---

## Pre-Push Checklist

**Before any `git push`, you MUST apply pending migrations and deploy changed edge functions — do not just surface findings, execute them.**

1. **Apply unapplied migrations** — Compare `supabase/migrations/` against production (query `supabase_migrations.schema_migrations` via the Supabase MCP `list_migrations` tool or `execute_sql`). For each migration not yet applied, use the Supabase MCP `apply_migration` tool to apply it immediately. Do not push with unapplied migrations.
2. **Deploy changed edge functions** — Run `git diff origin/main -- supabase/functions/` to detect local changes not yet deployed. For each changed function, use the Supabase MCP `deploy_edge_function` tool to deploy it immediately. Do not push with undeployed functions.
3. **Verify before pushing** — Confirm all migrations are applied and all edge functions are deployed, then push.

---

## Security & Compliance

- **Never commit secrets** — `.env`, credentials, API keys must be in `.gitignore`
- **Validate all user input** — At API boundaries, form submissions, URL parameters
- **Use parameterized queries** — Never interpolate user input into SQL strings
- **CORS and security headers** — Configure appropriately for each deployment
- **Rate limiting** — Apply to public-facing API routes
- **Content Security Policy** — Set appropriate CSP headers

---

## Project-Specific Configuration

> **Fill in these sections as the project takes shape.**

### Color System (GitHub Primer — see `DESIGN.md`)

| Token | Hex | Usage |
|-------|-----|-------|
| `accent` (blue) | `#0969da` | Links, focus states, selected items |
| `primary` (green) | `#1f883d` | Primary CTA buttons |
| `success` | `#1a7f37` | Success states, open issues |
| `danger` | `#d1242f` | Error states, destructive actions, closed |
| `attention` | `#9a6700` | Warnings, attention required |
| `severe` | `#bc4c00` | Critical warnings |
| `done` | `#8250df` | Completed states, merged PRs |
| `sponsors` | `#bf3989` | Sponsorship, heart actions |
| `background` | `#ffffff` | Page backgrounds |
| `background-muted` | `#f6f8fa` | Muted backgrounds, input rest state |
| `text` | `#1f2328` | Body text |
| `text-muted` | `#59636e` | Secondary text |
| `border` | `#d1d9e0` | Default borders |

### Design Tokens (GitHub Primer — see `DESIGN.md`)

- **Border radius (cards)**: `6px` (`--borderRadius-medium`)
- **Border radius (buttons)**: `6px` (`--borderRadius-medium`)
- **Border radius (inputs)**: `6px` (`--borderRadius-medium`)
- **Border radius (modals)**: `12px` (`--borderRadius-large`)
- **Font stack**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif`
- **Monospace font**: `ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace`
- **Body line-height**: `1.5`
- **Focus outline**: `2px solid #0969da`, offset `-2px`
- **Motion (fast)**: `150ms` — micro-interactions, hover
- **Motion (normal)**: `200ms` — standard transitions
- **Motion (slow)**: `300ms` — page transitions, complex animations

### Key Domain Terminology

| Internal Code Name | User-Facing Name | Notes |
|--------------------|------------------|-------|
| [e.g., `jan`] | [e.g., "Jann"] | [Do NOT rename code identifiers] |

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| | | |

### Database Tables

| Table | Key Fields | Notes |
|-------|------------|-------|
| | | |

---

## Language & Tone Rules

> **Define how copy should differ by audience.**

### User-Facing
- [e.g., Use plain, warm language — no jargon]
- [e.g., "Daily check-in" not "assessment"]

### Admin-Facing
- [e.g., Technical terminology is appropriate]

### Investor/Business
- [e.g., Business metrics and market terminology OK]

---

## What This Project Is

> **Write a 2-3 sentence description of the project. Include the tagline if there is one. This helps Claude understand context for every decision.**

[Project description here]

There are **[N] products**:
1. **[App 1]** — [Tech stack] ([audience]-facing)
2. **[App 2]** — [Tech stack] ([audience]-facing)
3. **[App 3]** — [Tech stack] ([audience]-facing)

---

## First-Session Checklist

When starting a brand new project, Claude should guide the user through:

- [ ] Confirm project name and package scope
- [ ] Set up monorepo scaffold (turbo.json, pnpm-workspace.yaml, base tsconfigs)
- [ ] Initialize Supabase (`supabase init`, `supabase link`)
- [ ] Create shared package with color tokens and base types
- [ ] Scaffold each app with appropriate framework
- [ ] Set up Vercel projects and connect to repo
- [ ] Configure environment variables across all environments
- [ ] Create initial database migration (users table, auth triggers, RLS)
- [ ] Add test account credentials to this file
- [ ] Create `PROGRESS.md` with initial state
- [ ] Verify builds pass for all apps
- [ ] Make first deployment to confirm pipeline works end-to-end

> **Ask the user**: "Before we start building, I need a few things:
> 1. What test account credentials should I use for verifying changes? (email/password for each app)
> 2. What's your Supabase project ref? (from your dashboard URL)
> 3. What's your Vercel team name?
> 4. Do you have custom domains ready, or should we use Vercel defaults for now?
> 5. What auth providers do you need? (email, Google, Apple, etc.)
> I'll add these to the CLAUDE.md so every session has them."
