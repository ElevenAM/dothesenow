import { test, expect } from "@playwright/test";

const SIDEBAR_LINKS = [
  { label: "Overview", heading: /overview|dashboard/i },
  { label: "Strategy", heading: /strategy documents/i },
  { label: "Contacts", heading: /contacts/i },
  { label: "Tasks", heading: /daily tasks/i },
  { label: "Pipeline", heading: /pipeline/i },
  { label: "Approvals", heading: /approvals/i },
];

test.describe("navigation smoke", () => {
  test("all sidebar links resolve without 404s", async ({ page }) => {
    // Collect console errors for hydration check
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/marketing");
    await expect(page.locator("aside")).toBeVisible();

    for (const { label, heading } of SIDEBAR_LINKS) {
      await page.getByRole("link", { name: label }).click();
      // Verify page renders a heading (not a 404)
      await expect(
        page.getByRole("heading", { name: heading })
      ).toBeVisible({ timeout: 10000 });
    }

    // Assert no hydration warnings
    const hydrationErrors = consoleErrors.filter(
      (msg) => /hydration|mismatch/i.test(msg)
    );
    expect(hydrationErrors).toHaveLength(0);
  });
});
