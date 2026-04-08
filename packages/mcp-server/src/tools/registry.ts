import type { SupabaseClient } from "@supabase/supabase-js";
import { createOrgClient, OrgScopedClient } from "../lib/supabase.js";
import type { ToolDefinition, ToolHandler, ToolResult } from "./types.js";
import { QueryError } from "@dothesenow/queries";
import { crm } from "./crm.js";
import { strategy } from "./strategy.js";
import { marketplace } from "./marketplace.js";
import { campaigns } from "./campaigns.js";
import { dailyTasks } from "./daily-tasks.js";
import { approvals } from "./approvals.js";

const modules = [crm, strategy, marketplace, campaigns, dailyTasks, approvals];

const allHandlers: Record<string, ToolHandler> = {};
const allDefinitions: ToolDefinition[] = [];

for (const mod of modules) {
  allDefinitions.push(...mod.definitions);
  for (const [name, handler] of Object.entries(mod.handlers)) {
    allHandlers[name] = handler;
  }
}

// ─── Pure data accessors — no side effects, safe to import anywhere ─────

export function getAllDefinitions(): ToolDefinition[] {
  return allDefinitions;
}

export function getAllHandlers(): Record<string, ToolHandler> {
  return allHandlers;
}

// ─── Error wrapping shared by both handle functions ─────────────────────

function wrapError(name: string, error: unknown): ToolResult {
  let message: string;
  if (error instanceof QueryError) {
    message = `[table: ${error.table}, op: ${error.operation}] ${error.message}`;
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error);
  }
  return {
    content: [{ type: "text", text: `Error in ${name}: ${message}` }],
    isError: true,
  };
}

// ─── Org-injected handler (for HTTP/remote MCP endpoint) ────────────────

/**
 * Handle a tool call with an externally-constructed OrgScopedClient.
 * Strips any client-provided `org_id` from args for security —
 * the API key determines the org, not the client.
 */
export async function handleToolForOrg(
  name: string,
  args: Record<string, unknown>,
  orgClient: OrgScopedClient,
): Promise<ToolResult> {
  const handler = allHandlers[name];
  if (!handler) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  // Strip org_id — the caller has already resolved the org via API key
  const { org_id: _stripped, ...safeArgs } = args;

  try {
    return await handler(orgClient, safeArgs);
  } catch (error: unknown) {
    return wrapError(name, error);
  }
}

// ─── Stdio handler (backward compat for local MCP server) ──────────────

/**
 * Handle a tool call for the stdio transport.
 * Resolves org from args.org_id or ORG_ID env var.
 * Requires a pre-constructed Supabase admin client.
 */
export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const handler = allHandlers[name];
  if (!handler) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  const orgId = (args.org_id as string) || process.env.ORG_ID;
  if (!orgId) {
    return {
      content: [
        {
          type: "text",
          text: "org_id is required: pass it as a tool parameter or set ORG_ID in .env",
        },
      ],
      isError: true,
    };
  }

  const client = createOrgClient(supabase, orgId);

  try {
    return await handler(client, args);
  } catch (error: unknown) {
    return wrapError(name, error);
  }
}
