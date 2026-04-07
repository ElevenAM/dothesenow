import { describe, it, expect } from "vitest";
import { selectFrameworks } from "../frameworks/index.js";
import type { FrameworkId } from "../types.js";

describe("selectFrameworks", () => {
  // Always included: bullseye, gaccs, ice
  const ALWAYS = ["bullseye", "gaccs", "ice"] satisfies FrameworkId[];

  describe("bootstrap tier", () => {
    it("b2b_saas: includes AARRR (digital funnel), no Growth Matrix", () => {
      const result = selectFrameworks("b2b_saas", "bootstrap");
      expect(result).toEqual([...ALWAYS, "aarrr"]);
    });

    it("dev_tools: includes AARRR (digital funnel), no Growth Matrix", () => {
      const result = selectFrameworks("dev_tools", "bootstrap");
      expect(result).toEqual([...ALWAYS, "aarrr"]);
    });

    it("dtc_ecommerce: no AARRR, no Growth Matrix", () => {
      const result = selectFrameworks("dtc_ecommerce", "bootstrap");
      expect(result).toEqual(ALWAYS);
    });

    it("fintech: includes AARRR, no Growth Matrix", () => {
      const result = selectFrameworks("fintech", "bootstrap");
      expect(result).toEqual([...ALWAYS, "aarrr"]);
    });

    it("marketplace: includes AARRR, no Growth Matrix", () => {
      const result = selectFrameworks("marketplace", "bootstrap");
      expect(result).toEqual([...ALWAYS, "aarrr"]);
    });

    it("healthtech: no AARRR, no Growth Matrix", () => {
      const result = selectFrameworks("healthtech", "bootstrap");
      expect(result).toEqual(ALWAYS);
    });

    it("other: only base frameworks", () => {
      const result = selectFrameworks("other", "bootstrap");
      expect(result).toEqual(ALWAYS);
    });
  });

  describe("growth tier", () => {
    it("b2b_saas: includes AARRR + Growth Matrix", () => {
      const result = selectFrameworks("b2b_saas", "growth");
      expect(result).toEqual([...ALWAYS, "aarrr", "growth_matrix"]);
    });

    it("dtc_ecommerce: includes Growth Matrix, no AARRR", () => {
      const result = selectFrameworks("dtc_ecommerce", "growth");
      expect(result).toEqual([...ALWAYS, "growth_matrix"]);
    });

    it("healthtech: includes Growth Matrix, no AARRR", () => {
      const result = selectFrameworks("healthtech", "growth");
      expect(result).toEqual([...ALWAYS, "growth_matrix"]);
    });

    it("other: no Growth Matrix, no AARRR", () => {
      const result = selectFrameworks("other", "growth");
      expect(result).toEqual(ALWAYS);
    });
  });

  describe("scale tier", () => {
    it("fintech: includes AARRR + Growth Matrix", () => {
      const result = selectFrameworks("fintech", "scale");
      expect(result).toEqual([...ALWAYS, "aarrr", "growth_matrix"]);
    });

    it("marketplace: includes AARRR + Growth Matrix", () => {
      const result = selectFrameworks("marketplace", "scale");
      expect(result).toEqual([...ALWAYS, "aarrr", "growth_matrix"]);
    });
  });

  describe("framework count", () => {
    it("always includes at least 3 frameworks", () => {
      const result = selectFrameworks("other", "bootstrap");
      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    it("never exceeds 5 frameworks", () => {
      const result = selectFrameworks("b2b_saas", "scale");
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });
});
