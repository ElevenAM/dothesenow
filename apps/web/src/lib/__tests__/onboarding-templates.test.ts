import { describe, it, expect } from "vitest";
import { selectTemplate } from "@/lib/onboarding/templates";
import { Industry } from "@dothesenow/types";

describe("selectTemplate", () => {
  it("returns B2B SaaS template", () => {
    const result = selectTemplate(Industry.B2bSaas);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("B2B SaaS Marketing Strategy");
    expect(result!.content).toContain("## Goals");
    expect(result!.content).toContain("## Experiment Backlog");
  });

  it("returns Dev Tools template", () => {
    const result = selectTemplate(Industry.DevTools);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Developer Tools Marketing Strategy");
    expect(result!.content).toContain("documentation");
  });

  it("returns DTC eCommerce template", () => {
    const result = selectTemplate(Industry.DtcEcommerce);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("DTC eCommerce Marketing Strategy");
    expect(result!.content).toContain("Email/SMS");
  });

  it("returns null for Fintech (no template yet)", () => {
    expect(selectTemplate(Industry.Fintech)).toBeNull();
  });

  it("returns null for Marketplace (no template yet)", () => {
    expect(selectTemplate(Industry.Marketplace)).toBeNull();
  });

  it("returns null for Healthtech (no template yet)", () => {
    expect(selectTemplate(Industry.Healthtech)).toBeNull();
  });

  it("returns null for Other (no template yet)", () => {
    expect(selectTemplate(Industry.Other)).toBeNull();
  });
});
