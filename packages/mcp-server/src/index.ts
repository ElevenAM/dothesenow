import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getAllDefinitions, handleTool } from "./tools/registry.js";

const server = new Server(
  { name: "marketing-ops", version: "0.2.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getAllDefinitions(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleTool(name, (args ?? {}) as Record<string, unknown>);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Marketing Ops MCP server running on stdio");
}

main().catch(console.error);
