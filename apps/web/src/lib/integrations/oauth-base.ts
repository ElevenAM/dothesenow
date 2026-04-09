/**
 * Shared OAuth 2.0 flow for provider integrations.
 * Slack, HubSpot, and GA4 each provide a config object;
 * this module handles the common URL construction, code exchange, and token refresh.
 */

export interface OAuthProviderConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  redirectPath: string;
  /** Whether this provider issues refresh tokens (Slack: false, HubSpot/GA: true) */
  hasRefreshToken: boolean;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  /** Provider-specific fields preserved from the raw response */
  raw: Record<string, unknown>;
}

/**
 * Build the OAuth authorize URL with query parameters.
 */
export function buildOAuthAuthorizeUrl(
  config: OAuthProviderConfig,
  state: string,
): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL must be set for OAuth redirect URIs");
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${appUrl}${config.redirectPath}`,
    scope: config.scopes.join(" "),
    state,
    response_type: "code",
  });

  return `${config.authUrl}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeOAuthCode(
  config: OAuthProviderConfig,
  code: string,
): Promise<OAuthTokenResponse> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL must be set");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: `${appUrl}${config.redirectPath}`,
    code,
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token exchange failed (${res.status}): ${text}`);
  }

  const raw = (await res.json()) as Record<string, unknown>;

  return {
    access_token: raw.access_token as string,
    refresh_token: raw.refresh_token as string | undefined,
    expires_in: raw.expires_in as number | undefined,
    token_type: raw.token_type as string | undefined,
    scope: raw.scope as string | undefined,
    raw,
  };
}

/**
 * Refresh an access token using a refresh token.
 * Only applicable to providers with hasRefreshToken: true.
 */
export async function refreshOAuthToken(
  config: OAuthProviderConfig,
  refreshToken: string,
): Promise<OAuthTokenResponse> {
  if (!config.hasRefreshToken) {
    throw new Error(`Provider does not support token refresh`);
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token refresh failed (${res.status}): ${text}`);
  }

  const raw = (await res.json()) as Record<string, unknown>;

  return {
    access_token: raw.access_token as string,
    refresh_token: raw.refresh_token as string | undefined,
    expires_in: raw.expires_in as number | undefined,
    token_type: raw.token_type as string | undefined,
    scope: raw.scope as string | undefined,
    raw,
  };
}
