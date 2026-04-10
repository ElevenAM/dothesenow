# MCP OAuth Plan — Amendment: Adopt `mcp-handler`

> **Purpose**: Replace hand-rolled resource-server plumbing in the existing plan with Vercel's `mcp-handler` package. The authorization server (Phases 1–5, 7) is unchanged. This amendment covers only the differences.

---

## New Dependency

```bash
# In apps/web/
pnpm add mcp-handler
```

This replaces the manual `Server`, `WebStandardStreamableHTTPServerTransport`, and `WWW-Authenticate` header construction currently in `apps/web/src/app/api/mcp/route.ts`. The existing `@modelcontextprotocol/sdk` dependency in `packages/mcp-server` stays — it's used for tool definitions, not HTTP transport.

---

## Change 1: `.well-known/oauth-protected-resource` route (Phase 3)

**File**: `apps/web/src/app/.well-known/oauth-protected-resource/route.ts`

**Current** (hand-rolled):
```ts
import { getAppUrl } from "@/lib/mcp-oauth/config";

export function GET() {
  const appUrl = getAppUrl();
  return Response.json(
    {
      resource: `${appUrl}/api/mcp`,
      authorization_servers: [appUrl],
      scopes_supported: ["mcp"],
      bearer_methods_supported: ["header"],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
```

**Replace with**:
```ts
import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";
import { getAppUrl } from "@/lib/mcp-oauth/config";

const handler = protectedResourceHandler({
  authServerUrls: [getAppUrl()],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
```

**Why**: The library formats the response per RFC 9728, handles CORS OPTIONS automatically (which we're missing today — MCP clients need the preflight), and will track any spec changes to the metadata shape. We also gain the `OPTIONS` handler that Claude's MCP client may send as a CORS preflight before reading the metadata.

**Keep unchanged**: `.well-known/oauth-authorization-server/route.ts` stays as-is. That endpoint describes *our* authorization server, which `mcp-handler` has no opinion on.

---

## Change 2: MCP route rewrite using `createMcpHandler` + `withMcpAuth` (Phase 6)

**File**: `apps/web/src/app/api/mcp/route.ts`

This is the largest change. The current file manually constructs a `Server` and `WebStandardStreamableHTTPServerTransport` per request, handles auth extraction, and formats 401 responses. `mcp-handler` replaces all of that boilerplate.

**Replace the entire file with**:

```ts
import { z } from "zod";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { getAllDefinitions, handleToolForOrg } from "@dothesenow/mcp-server/tools";
import { validateApiKey } from "@dothesenow/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { validateAccessToken } from "@/lib/mcp-oauth/tokens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 60 });

// ─── Build handler ─────────────────────────────────────────────

const handler = createMcpHandler(
  (server) => {
    // Register every tool from the shared definitions package
    for (const def of getStrippedDefinitions()) {
      server.tool(def.name, def.description ?? "", def.inputSchema, async (args) => {
        // orgId is injected by the auth layer via extra.authInfo
        // We retrieve it inside the tool call — see verifyToken below
        const orgId = (server as any).__dtn_orgId;
        const adminClient = createAdminClient();
        const { OrgScopedClient } = await import("@dothesenow/mcp-server/lib");
        const orgClient = new OrgScopedClient(adminClient, orgId);
        return handleToolForOrg(def.name, args as Record<string, unknown>, orgClient);
      });
    }
  },
  {},
  { basePath: "/api" },
);

// ─── Dual-auth token verifier ──────────────────────────────────

const verifyToken = async (
  req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;

  const adminClient = createAdminClient();

  // API key auth (existing path)
  if (bearerToken.startsWith("dtn_mcp_")) {
    let result: Awaited<ReturnType<typeof validateApiKey>>;
    try {
      result = await validateApiKey(adminClient, bearerToken);
    } catch {
      return undefined;
    }
    if (!result) return undefined;

    const rl = limiter.check(result.orgId);
    if (!rl.allowed) return undefined; // withMcpAuth returns 401; rate-limit granularity is acceptable

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
      if (!rl.allowed) return undefined;

      return {
        token: bearerToken,
        scopes: ["mcp"],
        clientId: `oauth:${result.tokenId}`,
        extra: { orgId: result.orgId, tokenId: result.tokenId },
      };
    } catch {
      return undefined;
    }
  }

  return undefined; // unrecognized prefix
};

// ─── Wrap with auth ────────────────────────────────────────────

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: ["mcp"],
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
```

### What this changes vs. the current implementation

1. **Removes**: Manual `Server` + `WebStandardStreamableHTTPServerTransport` construction, the `authenticateRequest()` function, the `unauthorizedResponse()` helper, and the `getAppUrl` import (no longer needed here — the metadata URL comes from `resourceMetadataPath`).
2. **Adds**: `withMcpAuth` handles 401/403 responses with spec-compliant `WWW-Authenticate` headers automatically.
3. **Preserves**: The exact same dual-auth logic (prefix-based routing to API key vs. OAuth validation), rate limiting, and org-scoped tool execution.

### Known design issue to resolve during implementation

The `createMcpHandler` callback registers tools at server creation time, but the `orgId` isn't known until the `verifyToken` function runs. There are two approaches:

**Option A — Closure over request context**: `mcp-handler` may pass `authInfo` into tool handlers via `extra.authInfo`. Check the library's current API; if tools receive an `extra` argument containing `authInfo`, read `extra.authInfo.extra.orgId` directly. This is the clean path.

**Option B — Pre-auth wrapper**: Keep the current pattern where auth runs *before* the MCP handler, and pass `orgId` into `createMcpServer()` as a closure. This means creating the handler per-request rather than once at module level. Less elegant but guaranteed to work:

```ts
// Per-request pattern (fallback if Option A isn't available)
export async function POST(request: Request) {
  const authResult = await runDualAuth(request); // extracted helper
  if (authResult instanceof Response) return authResult;

  const handler = createMcpHandler((server) => {
    // orgId available in closure
    for (const def of getStrippedDefinitions()) {
      server.tool(def.name, def.description ?? "", def.inputSchema, async (args) => {
        const orgClient = new OrgScopedClient(createAdminClient(), authResult.orgId);
        return handleToolForOrg(def.name, args as Record<string, unknown>, orgClient);
      });
    }
  }, {}, { basePath: "/api" });

  return handler(request);
}
```

Check `mcp-handler` docs/source for which pattern is supported before implementing.

---

## Change 3: Remove `getAppUrl()` from the MCP route's 401 responses

The current `unauthorizedResponse()` helper manually constructs:
```
WWW-Authenticate: Bearer resource_metadata="https://<APP_URL>/.well-known/oauth-protected-resource"
```

This is now handled by `withMcpAuth` via the `resourceMetadataPath` config. Delete the `unauthorizedResponse()` function and the `getAppUrl` import from the MCP route. The `getAppUrl` function in `config.ts` stays — it's still used by the `.well-known/oauth-authorization-server` route and the consent page.

---

## What does NOT change

Everything else in the plan remains exactly as written:

- **Phase 1** (database migration) — unchanged
- **Phase 2** (core libraries: PKCE, codes, tokens) — unchanged
- **Phase 3** (`.well-known/oauth-authorization-server`) — unchanged (only the protected-resource route changes)
- **Phase 4** (OAuth authorize + token API routes) — unchanged
- **Phase 5** (consent page + middleware + login redirect chain) — unchanged
- **Phase 7** (settings UI) — unchanged
- **Phase 8** (hardening) — unchanged
- **Environment variables** — unchanged
- **Verification steps** — unchanged, but add one: confirm `withMcpAuth` returns proper `WWW-Authenticate` header on unauthenticated requests by curling `/api/mcp` with no bearer token

---

## Implementation order

Apply these changes as part of Phase 6 in the original plan. Specifically:

1. `pnpm add mcp-handler` in `apps/web/`
2. Rewrite `.well-known/oauth-protected-resource/route.ts` (Change 1)
3. Rewrite `api/mcp/route.ts` (Change 2)
4. Verify: existing API key auth still works, OAuth token auth still works, unauthenticated requests get proper `WWW-Authenticate` header, CORS preflight on `.well-known` returns 200
