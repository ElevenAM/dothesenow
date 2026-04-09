import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOrgIntegration,
  getIntegrationSecret,
} from "@dothesenow/queries";
import { refreshOAuthToken } from "@/lib/integrations/oauth-base";
import { getGAOAuthConfig } from "./oauth";

const GA_API_BASE = "https://analyticsdata.googleapis.com/v1beta";

// ─── Types ─────────────────────────────────────────────────

export interface GAReportRow {
  dimensionValues?: { value: string }[];
  metricValues?: { value: string }[];
}

export interface GAReportResponse {
  rows?: GAReportRow[];
  rowCount?: number;
  metadata?: unknown;
}

// ─── Client ────────────────────────────────────────────────

export class GoogleAnalyticsClient {
  private adminClient: SupabaseClient;
  private orgId: string;

  constructor(adminClient: SupabaseClient, orgId: string) {
    this.adminClient = adminClient;
    this.orgId = orgId;
  }

  private async getAccessToken(): Promise<{ token: string; propertyId: string | null }> {
    const ctx = { client: this.adminClient, orgId: this.orgId };
    const integration = await getOrgIntegration(ctx, "google_analytics");

    if (!integration || !integration.is_active) {
      throw new Error("Google Analytics integration not connected");
    }

    const config = integration.config as Record<string, unknown>;
    const expiresAt = config.token_expires_at as string | null;
    const currentToken = config.access_token as string | null;
    const propertyId = (config.property_id as string) ?? null;

    // Check token validity (5 min buffer)
    if (currentToken && expiresAt) {
      const expiryMs = new Date(expiresAt).getTime();
      if (Date.now() < expiryMs - 5 * 60 * 1000) {
        return { token: currentToken, propertyId };
      }
    }

    // Refresh
    const refreshToken = await getIntegrationSecret(this.adminClient, integration.vault_secret_id!);
    const oauthConfig = getGAOAuthConfig();
    const tokenResponse = await refreshOAuthToken(oauthConfig, refreshToken);

    const newExpiresAt = tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
      : null;

    await this.adminClient
      .from("dtn_org_integrations")
      .update({
        config: {
          ...config,
          access_token: tokenResponse.access_token,
          token_expires_at: newExpiresAt,
        },
      })
      .eq("id", integration.id);

    return { token: tokenResponse.access_token, propertyId };
  }

  /**
   * Run a GA4 Data API report.
   */
  async runReport(opts: {
    propertyId?: string;
    dateRanges: { startDate: string; endDate: string }[];
    metrics: { name: string }[];
    dimensions?: { name: string }[];
  }): Promise<GAReportResponse> {
    const { token, propertyId: defaultPropertyId } = await this.getAccessToken();
    const pid = opts.propertyId ?? defaultPropertyId;

    if (!pid) {
      throw new Error("No GA4 property ID configured. Set it in integration settings.");
    }

    const res = await fetch(`${GA_API_BASE}/properties/${pid}:runReport`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: opts.dateRanges,
        metrics: opts.metrics,
        dimensions: opts.dimensions,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GA Data API error ${res.status}: ${text}`);
    }

    return (await res.json()) as GAReportResponse;
  }
}
