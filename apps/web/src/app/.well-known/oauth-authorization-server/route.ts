import { getAppUrl } from "@/lib/mcp-oauth/config";

/** RFC 8414 — Authorization Server Metadata */
export function GET() {
  const appUrl = getAppUrl();

  return Response.json(
    {
      issuer: appUrl,
      authorization_endpoint: `${appUrl}/api/mcp/oauth/authorize`,
      token_endpoint: `${appUrl}/api/mcp/oauth/token`,
      registration_endpoint: `${appUrl}/api/mcp/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_post"],
      scopes_supported: ["mcp"],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
