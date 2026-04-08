import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getAllDefinitions, handleToolForOrg } from "@dothesenow/mcp-server/tools";
import { OrgScopedClient } from "@dothesenow/mcp-server/lib";
import { validateApiKey } from "@dothesenow/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 60 requests per minute per org — generous for MCP tool calls */
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 60 });

// ─── Auth helper ────────────────────────────────────────────────

async function authenticateRequest(
  request: Request,
): Promise<{ orgId: string; keyId: string } | Response> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const adminClient = createAdminClient();
  const result = await validateApiKey(adminClient, token);

  if (!result) {
    return new Response(
      JSON.stringify({ error: "Invalid or revoked API key" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Rate limit per org
  const rl = limiter.check(result.orgId);
  if (!rl.allowed) {
    return rateLimitResponse(rl.retryAfterMs);
  }

  return result;
}

// ─── Strip org_id from tool schemas ─────────────────────────────

function getStrippedDefinitions() {
  return getAllDefinitions().map((def) => {
    const { org_id: _stripped, ...properties } = def.inputSchema.properties;
    return {
      ...def,
      inputSchema: {
        ...def.inputSchema,
        properties,
      },
    };
  });
}

// ─── Create an MCP server + transport per request (stateless) ───

function createMcpServer(orgId: string) {
  const adminClient = createAdminClient();
  const orgClient = new OrgScopedClient(adminClient, orgId);

  const server = new Server(
    { name: "dothesenow", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getStrippedDefinitions(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolForOrg(name, (args ?? {}) as Record<string, unknown>, orgClient);
  });

  return server;
}

// ─── Route handlers ─────────────────────────────────────────────

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof Response) return auth;

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,      // no SSE — fits Vercel serverless
  });

  const server = createMcpServer(auth.orgId);
  await server.connect(transport);

  return transport.handleRequest(request);
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof Response) return auth;

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = createMcpServer(auth.orgId);
  await server.connect(transport);

  return transport.handleRequest(request);
}

export async function DELETE(request: Request) {
  // Session teardown — stateless mode, so just acknowledge
  return new Response(null, { status: 200 });
}
