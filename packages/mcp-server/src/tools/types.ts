import type { OrgScopedClient } from "../lib/supabase.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export type ToolHandler = (
  client: OrgScopedClient,
  args: Record<string, unknown>,
) => Promise<ToolResult>;

export interface ToolModule {
  definitions: ToolDefinition[];
  handlers: Record<string, ToolHandler>;
}

export function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

export function err(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}
