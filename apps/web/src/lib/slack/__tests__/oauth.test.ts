import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAuthorizeUrl } from "../oauth";

describe("buildAuthorizeUrl", () => {
  beforeEach(() => {
    vi.stubEnv("SLACK_CLIENT_ID", "test-client-id-123");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dothesenow.com");
  });

  it("builds a valid authorize URL with required params", () => {
    const url = buildAuthorizeUrl("test-state-token");
    const parsed = new URL(url);

    expect(parsed.origin).toBe("https://slack.com");
    expect(parsed.pathname).toBe("/oauth/v2/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("test-client-id-123");
    expect(parsed.searchParams.get("state")).toBe("test-state-token");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://dothesenow.com/api/slack/oauth",
    );
  });

  it("includes required bot scopes", () => {
    const url = buildAuthorizeUrl("state");
    const parsed = new URL(url);
    const scope = parsed.searchParams.get("scope") ?? "";

    expect(scope).toContain("app_mentions:read");
    expect(scope).toContain("chat:write");
    expect(scope).toContain("commands");
    expect(scope).toContain("users:read");
    expect(scope).toContain("users:read.email");
  });

  it("throws if SLACK_CLIENT_ID is not set", () => {
    vi.stubEnv("SLACK_CLIENT_ID", "");
    expect(() => buildAuthorizeUrl("state")).toThrow("SLACK_CLIENT_ID");
  });
});
