import { createOrgClient } from "../lib/supabase.js";
import type { ToolDefinition, ToolHandler, ToolResult } from "./types.js";
import { crm } from "./crm.js";
import { strategy } from "./strategy.js";
import { marketplace } from "./marketplace.js";
import { campaigns } from "./campaigns.js";
import { dailyTasks } from "./daily-tasks.js";

const modules = [crm, strategy, marketplace, campaigns, dailyTasks];

const allHandlers: Record<string, ToolHandler> = {};
const allDefinitions: ToolDefinition[] = [];

for (const mod of modules) {
  allDefinitions.push(...mod.definitions);
  for (const [name, handler] of Object.entries(mod.handlers)) {
    allHandlers[name] = handler;
  }
}

export function getAllDefinitions(): ToolDefinition[] {
  return allDefinitions;
}

export async function handleTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const handler = allHandlers[name];
  if (!handler) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  const client = createOrgClient(args.org_id as string | undefined);

  try {
    return await handler(client, args);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error in ${name}: ${message}` }],
      isError: true,
    };
  }
}
