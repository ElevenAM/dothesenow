# Marketing Ops MCP Server — Setup Guide

## What This Is

A complete starter project that connects a **new, standalone Supabase database** (CRM + strategy hub + talent marketplace) to **Claude Desktop** via MCP. Your BridgeCalm project is not touched.

## Files Overview

```
marketing-mcp-server/
├── architecture.html          ← Open in browser to see the full architecture diagram
├── supabase-migration.sql     ← Database schema (run in a NEW Supabase project)
├── src/index.ts               ← MCP server with 21 tools
├── package.json               ← Node.js dependencies
├── tsconfig.json              ← TypeScript config
├── .env.example               ← Environment variables template
├── claude-desktop-config.jsonc ← Claude Desktop MCP configuration
└── SETUP.md                   ← This file
```

## Quick Start (15 minutes)

### 1. Create a New Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New Project** (use your existing org or create a new one)
3. Name it `marketing-ops` (or whatever you like)
4. Pick a region close to you, set a database password
5. Wait for it to provision

### 2. Run the Database Migration

1. In your new project, go to **SQL Editor**
2. Paste the contents of `supabase-migration.sql`
3. Click **Run** — this creates all 11 tables, indexes, views, and RLS policies

### 3. Install & Build the MCP Server

```bash
cd marketing-mcp-server
npm install
cp .env.example .env
```

Edit `.env` with your **new project's** credentials:
- `SUPABASE_URL` — from Settings → API → Project URL
- `SUPABASE_SERVICE_ROLE_KEY` — from Settings → API → service_role (secret)

Then build:
```bash
npm run build
```

### 4. Connect to Claude Desktop

Edit your Claude Desktop config file:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add to the `mcpServers` section:

```json
{
  "mcpServers": {
    "marketing-ops": {
      "command": "node",
      "args": ["/absolute/path/to/marketing-mcp-server/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://your-project-ref.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key"
      }
    }
  }
}
```

### 5. Restart Claude Desktop

Quit and reopen Claude Desktop. You should see "marketing-ops" in the MCP tools list.

## Try It Out

Once connected, try these prompts in Claude Desktop:

- "Add a new lead: Sarah Chen, therapist in Portland, found on Reddit"
- "Show me my pipeline summary"
- "Update the master strategy doc with our new positioning for Q2"
- "Create a freelance task for someone to write 3 blog posts about therapist burnout"
- "What competitors are we tracking?"

## What's NOT Built Yet (Future Phases)

- **Freelancer web portal** — a minimal Next.js app where freelancers browse tasks and submit work
- **Stripe Connect integration** — payment escrow and freelancer payouts
- **Vector embeddings** — the schema supports pgvector but the MCP server uses text search as a fallback; add an embedding generation step for semantic strategy search
- **BridgeCalm cross-project reads** — optional API calls to pull signup/retention metrics into your marketing database
- **Email notifications** — notify freelancers when tasks are posted or feedback is given
