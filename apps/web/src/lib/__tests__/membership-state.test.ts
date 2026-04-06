import { describe, it, expect } from "vitest";
import { getMembershipState } from "@/lib/auth-helpers";

describe("getMembershipState", () => {
  it("returns 'pending' for invited member (null user_id, active)", () => {
    expect(getMembershipState({ user_id: null, is_active: true })).toBe(
      "pending"
    );
  });

  it("returns 'active' for accepted member", () => {
    expect(
      getMembershipState({ user_id: "user-123", is_active: true })
    ).toBe("active");
  });

  it("returns 'inactive' for deactivated member", () => {
    expect(
      getMembershipState({ user_id: "user-123", is_active: false })
    ).toBe("inactive");
  });

  it("returns 'inactive' for deactivated invite (no user_id)", () => {
    expect(
      getMembershipState({ user_id: null, is_active: false })
    ).toBe("inactive");
  });
});
