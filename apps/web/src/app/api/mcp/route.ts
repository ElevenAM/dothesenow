import { withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
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
import { validateAccessToken } from "@/lib/mcp-oauth/tokens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 60 requests per minute per org — generous for MCP tool calls */
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 60 });

// ─── Strip org_id from tool schemas ─────────────────────────────

function getStrippedDefinitions() {
  return getAllDefinitions().map((def) => {
    const { org_id: _stripped, ...properties } = def.inputSchema.properties ?? {};
    const required = def.inputSchema.required?.filter((r: string) => r !== "org_id");
    return {
      ...def,
      inputSchema: {
        ...def.inputSchema,
        properties,
        ...(required && required.length > 0 ? { required } : {}),
      },
    };
  });
}

// ─── Create an MCP server per request (stateless) ───────────────

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

// ─── MCP request handler (auth already verified) ─────────────────

async function mcpHandler(request: Request): Promise<Response> {
  const authInfo = (request as Request & { auth?: AuthInfo }).auth;
  const orgId = (authInfo?.extra as Record<string, unknown> | undefined)?.orgId as string | undefined;

  if (!orgId) {
    return new Response(
      JSON.stringify({ error: "Missing org context" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (request.method === "DELETE") {
    return new Response(null, { status: 200 });
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = createMcpServer(orgId);
  await server.connect(transport);

  return transport.handleRequest(request);
}

// ─── Pre-resolve auth to handle 429/503 correctly ────────────────
//
// withMcpAuth can only return 401 for auth failures. We pre-resolve
// the token so that rate limits (429) and DB errors (503) get proper
// status codes instead of being collapsed into 401.

const authResultCache = new Map<Request, AuthInfo>();

async function resolveAuth(
  bearerToken: string,
): Promise<AuthInfo | Response | undefined> {
  const adminClient = createAdminClient();

  // API key auth (existing path)
  if (bearerToken.startsWith("dtn_mcp_")) {
    let result: Awaited<ReturnType<typeof validateApiKey>>;
    try {
      result = await validateApiKey(adminClient, bearerToken);
    } catch {
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    if (!result) return undefined; // Invalid key — let withMcpAuth return 401

    const rl = limiter.check(result.orgId);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

    return {
      token: bearerToken,
      scopes: ["mcp"],
      clientId: `apikey:${result.keyId}`,
      extra: { orgId: result.orgId, keyId: result.keyId },
    };
  }

  // OAuth access token auth
  if (bearerToken.startsWith("dtn_oat_")) {
    try {
      const result = await validateAccessToken(adminClient, bearerToken);
      if (!result) return undefined;

      const rl = limiter.check(result.orgId);
      if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

      return {
        token: bearerToken,
        scopes: ["mcp"],
        clientId: `oauth:${result.tokenId}`,
        extra: { orgId: result.orgId, tokenId: result.tokenId },
      };
    } catch {
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  return undefined;
}

const verifyToken = async (
  req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;

  // Check if pre-resolved by the wrapper
  const cached = authResultCache.get(req);
  if (cached) return cached;

  // Fallback: resolve inline (shouldn't normally reach here)
  const result = await resolveAuth(bearerToken);
  if (!result || result instanceof Response) return undefined;
  return result;
};

// ─── Wrap with auth — spec-compliant 401/WWW-Authenticate ──────

const authHandler = withMcpAuth(mcpHandler, verifyToken, {
  required: true,
  requiredScopes: ["mcp"],
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

// ─── Route handler: pre-checks then delegates to authHandler ────

async function handler(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (bearerToken) {
    const result = await resolveAuth(bearerToken);

    if (result instanceof Response) {
      // 429 or 503 — return directly, bypass withMcpAuth
      return result;
    }

    if (result) {
      // Cache so verifyToken doesn't re-query
      authResultCache.set(request, result);
    }
  }

  const response = await authHandler(request);
  authResultCache.delete(request);
  return response;
}

export { handler as GET, handler as POST, handler as DELETE };
