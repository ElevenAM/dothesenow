import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOrgIntegration,
  getIntegrationSecret,
  upsertOrgIntegration,
} from "@dothesenow/queries";
import { refreshOAuthToken, type OAuthProviderConfig } from "@/lib/integrations/oauth-base";

const HUBSPOT_API_BASE = "https://api.hubapi.com";

// ─── Types ─────────────────────────────────────────────────

export interface HubSpotContact {
  id: string;
  properties: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
}

export interface HubSpotContactsPage {
  results: HubSpotContact[];
  paging?: { next?: { after: string } };
}

// ─── Client ────────────────────────────────────────────────

export class HubSpotClient {
  private adminClient: SupabaseClient;
  private orgId: string;

  constructor(adminClient: SupabaseClient, orgId: string) {
    this.adminClient = adminClient;
    this.orgId = orgId;
  }

  /**
   * Get a valid access token, refreshing if expired.
   * Access token is stored in dtn_org_integrations.config (not Vault).
   * Refresh token is in Vault (referenced by vault_secret_id).
   */
  private async getAccessToken(): Promise<string> {
    const ctx = { client: this.adminClient, orgId: this.orgId };
    const integration = await getOrgIntegration(ctx, "hubspot");

    if (!integration || !integration.is_active) {
      throw new Error("HubSpot integration not connected");
    }

    const config = integration.config as Record<string, unknown>;
    const expiresAt = config.token_expires_at as string | null;
    const currentToken = config.access_token as string | null;

    // Check if token is still valid (with 5 min buffer)
    if (currentToken && expiresAt) {
      const expiryMs = new Date(expiresAt).getTime();
      if (Date.now() < expiryMs - 5 * 60 * 1000) {
        return currentToken;
      }
    }

    // Token expired — refresh it
    return this.refreshToken(integration.vault_secret_id!);
  }

  private async refreshToken(vaultSecretId: string): Promise<string> {
    const refreshToken = await getIntegrationSecret(this.adminClient, vaultSecretId);

    const config: OAuthProviderConfig = {
      authUrl: "",
      tokenUrl: "https://api.hubapi.com/oauth/v1/token",
      clientId: process.env.HUBSPOT_CLIENT_ID!,
      clientSecret: process.env.HUBSPOT_CLIENT_SECRET!,
      scopes: [],
      redirectPath: "",
      hasRefreshToken: true,
    };

    const tokenResponse = await refreshOAuthToken(config, refreshToken);

    // Update access token in config
    const expiresAt = tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
      : null;

    const ctx = { client: this.adminClient, orgId: this.orgId };
    const integration = await getOrgIntegration(ctx, "hubspot");

    if (integration) {
      const existingConfig = integration.config as Record<string, unknown>;
      await this.adminClient
        .from("dtn_org_integrations")
        .update({
          config: {
            ...existingConfig,
            access_token: tokenResponse.access_token,
            token_expires_at: expiresAt,
          },
        })
        .eq("id", integration.id);
    }

    return tokenResponse.access_token;
  }

  /**
   * Make an authenticated request to the HubSpot API.
   * Auto-retries once on 401 (token refresh), respects 429 rate limits.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retried = false,
  ): Promise<T> {
    const token = await this.getAccessToken();

    const res = await fetch(`${HUBSPOT_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // 401 — token may have been revoked mid-request; refresh and retry once
    if (res.status === 401 && !retried) {
      const ctx = { client: this.adminClient, orgId: this.orgId };
      const integration = await getOrgIntegration(ctx, "hubspot");
      if (integration?.vault_secret_id) {
        await this.refreshToken(integration.vault_secret_id);
        return this.request<T>(method, path, body, true);
      }
    }

    // 429 — rate limited; respect Retry-After
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "10", 10);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      return this.request<T>(method, path, body, retried);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HubSpot API error ${res.status}: ${text}`);
    }

    return (await res.json()) as T;
  }

  // ─── Contacts API ─────────────────────────────────────────

  async getContacts(opts?: {
    after?: string;
    limit?: number;
    properties?: string[];
  }): Promise<HubSpotContactsPage> {
    const params = new URLSearchParams();
    if (opts?.after) params.set("after", opts.after);
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.properties) {
      for (const p of opts.properties) params.append("properties", p);
    }

    const qs = params.toString();
    return this.request<HubSpotContactsPage>(
      "GET",
      `/crm/v3/objects/contacts${qs ? `?${qs}` : ""}`,
    );
  }

  async getContactById(contactId: string): Promise<HubSpotContact> {
    return this.request<HubSpotContact>(
      "GET",
      `/crm/v3/objects/contacts/${contactId}`,
    );
  }

  async createContact(
    properties: Record<string, string>,
  ): Promise<HubSpotContact> {
    return this.request<HubSpotContact>(
      "POST",
      "/crm/v3/objects/contacts",
      { properties },
    );
  }

  async updateContact(
    contactId: string,
    properties: Record<string, string>,
  ): Promise<HubSpotContact> {
    return this.request<HubSpotContact>(
      "PATCH",
      `/crm/v3/objects/contacts/${contactId}`,
      { properties },
    );
  }

  /**
   * Search for contacts modified since a given timestamp.
   */
  async getRecentlyModified(
    since: Date,
    opts?: { after?: string },
  ): Promise<HubSpotContactsPage> {
    const body = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "lastmodifieddate",
              operator: "GTE",
              value: since.getTime().toString(),
            },
          ],
        },
      ],
      sorts: [{ propertyName: "lastmodifieddate", direction: "ASCENDING" }],
      limit: 100,
      after: opts?.after ?? undefined,
    };

    return this.request<HubSpotContactsPage>(
      "POST",
      "/crm/v3/objects/contacts/search",
      body,
    );
  }
}
