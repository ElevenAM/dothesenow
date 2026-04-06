import { describe, it, expect, beforeEach } from "vitest";
import {
  ORG_COOKIE_NAME,
  COOKIE_OPTIONS,
  getActiveOrgId,
  setActiveOrgId,
  clearActiveOrgId,
} from "@/lib/org-context";
import {
  setMockCookie,
  clearMockCookies,
  getMockCookie,
} from "@/__tests__/setup";

describe("org-context", () => {
  beforeEach(() => {
    clearMockCookies();
  });

  it("ORG_COOKIE_NAME equals 'dtn_active_org'", () => {
    expect(ORG_COOKIE_NAME).toBe("dtn_active_org");
  });

  it("COOKIE_OPTIONS has correct shape", () => {
    expect(COOKIE_OPTIONS).toMatchObject({
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });
    expect(COOKIE_OPTIONS.maxAge).toBeGreaterThan(0);
  });

  describe("getActiveOrgId", () => {
    it("returns cookie value when set", async () => {
      setMockCookie("dtn_active_org", "org-123");
      const result = await getActiveOrgId();
      expect(result).toBe("org-123");
    });

    it("returns null when no cookie exists", async () => {
      const result = await getActiveOrgId();
      expect(result).toBeNull();
    });

    it("migrates legacy 'dtn_current_org' cookie to new name", async () => {
      setMockCookie("dtn_current_org", "org-legacy-456");
      const result = await getActiveOrgId();
      expect(result).toBe("org-legacy-456");
    });

    it("deletes legacy cookie after migration", async () => {
      setMockCookie("dtn_current_org", "org-legacy-456");
      await getActiveOrgId();
      expect(getMockCookie("dtn_current_org")).toBeUndefined();
    });

    it("copies legacy value to new cookie during migration", async () => {
      setMockCookie("dtn_current_org", "org-legacy-456");
      await getActiveOrgId();
      expect(getMockCookie("dtn_active_org")).toBe("org-legacy-456");
    });

    it("prefers new cookie over legacy when both exist", async () => {
      setMockCookie("dtn_active_org", "org-new");
      setMockCookie("dtn_current_org", "org-legacy");
      const result = await getActiveOrgId();
      expect(result).toBe("org-new");
    });
  });

  describe("setActiveOrgId", () => {
    it("sets the cookie value", async () => {
      await setActiveOrgId("org-789");
      expect(getMockCookie("dtn_active_org")).toBe("org-789");
    });
  });

  describe("clearActiveOrgId", () => {
    it("deletes the cookie", async () => {
      setMockCookie("dtn_active_org", "org-123");
      await clearActiveOrgId();
      expect(getMockCookie("dtn_active_org")).toBeUndefined();
    });
  });
});
