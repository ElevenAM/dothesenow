import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getAllDefinitions, handleTool } from "./tools/registry.js";

// Admin client for stdio transport — constructed once at startup
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const server = new Server(
  { name: "marketing-ops", version: "0.2.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getAllDefinitions(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleTool(name, (args ?? {}) as Record<string, unknown>, supabaseAdmin);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Marketing Ops MCP server running on stdio");
}

main().catch(console.error);
