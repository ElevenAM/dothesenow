/** OAuth 2.1 configuration for the MCP server connector. */

export const ACCESS_TOKEN_TTL_SECONDS = 3600; // 1 hour
export const REFRESH_TOKEN_TTL_DAYS = 30;
export const AUTH_CODE_TTL_MINUTES = 10;

/** Only these redirect URIs are accepted during DCR — exact match, no wildcards. */
export const ALLOWED_REDIRECT_URIS = Object.freeze([
  "https://claude.ai/api/mcp/auth_callback",
]);

export function getMcpOAuthConfig() {
  const paramsSecret = process.env.MCP_OAUTH_PARAMS_SECRET;

  if (!paramsSecret) {
    throw new Error(
      "MCP OAuth not configured: MCP_OAUTH_PARAMS_SECRET is required for cookie signing",
    );
  }

  return { paramsSecret };
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://app.dothesenow.com";
}
