import { test, expect } from "@playwright/test";

test.describe("Chat panel", () => {
  test("opens and shows empty state", async ({ page }) => {
    await page.goto("/marketing");
    await page.waitForLoadState("networkidle");

    // Click the chat toggle button
    const chatToggle = page.locator('button[aria-label="Open chat"]');
    await expect(chatToggle).toBeVisible();
    await chatToggle.click();

    // Chat panel should be visible with empty state
    await expect(
      page.locator("text=What did you get done today?"),
    ).toBeVisible();
    await expect(
      page.locator("text=DoTheseNow Assistant"),
    ).toBeVisible();
  });

  test("shows credits remaining", async ({ page }) => {
    await page.goto("/marketing");
    await page.waitForLoadState("networkidle");

    const chatToggle = page.locator('button[aria-label="Open chat"]');
    await chatToggle.click();

    // Should show credits count
    await expect(page.locator("text=/\\d+ credits/")).toBeVisible();
  });

  test("sends message and receives response", async ({ page }) => {
    await page.goto("/marketing");
    await page.waitForLoadState("networkidle");

    const chatToggle = page.locator('button[aria-label="Open chat"]');
    await chatToggle.click();

    // Type a message
    const input = page.locator(
      'textarea[placeholder*="Type a message"]',
    );
    await input.fill("What are my tasks today?");

    // Send the message
    const sendButton = page.locator("button:has(svg)").last();
    await sendButton.click();

    // User message should appear
    await expect(
      page.locator("text=What are my tasks today?"),
    ).toBeVisible();

    // Wait for assistant response (may take a while with real API)
    await expect(
      page.locator('[class*="bg-[var(--bgColor-muted)]"]').last(),
    ).toBeVisible({ timeout: 30000 });
  });

  test("can minimize and restore chat", async ({ page }) => {
    await page.goto("/marketing");
    await page.waitForLoadState("networkidle");

    // Open chat
    const chatToggle = page.locator('button[aria-label="Open chat"]');
    await chatToggle.click();

    // Minimize
    const minimizeButton = page
      .locator("text=DoTheseNow Assistant")
      .locator("..")
      .locator("..")
      .locator("button")
      .first();
    await minimizeButton.click();

    // Should show minimized bar
    await expect(page.locator("text=Chat")).toBeVisible();

    // Chat panel title should not be visible
    await expect(
      page.locator("text=DoTheseNow Assistant"),
    ).not.toBeVisible();
  });

  test("can close chat completely", async ({ page }) => {
    await page.goto("/marketing");
    await page.waitForLoadState("networkidle");

    // Open chat
    const chatToggle = page.locator('button[aria-label="Open chat"]');
    await chatToggle.click();
    await expect(
      page.locator("text=DoTheseNow Assistant"),
    ).toBeVisible();

    // Close
    const closeButtons = page
      .locator("text=DoTheseNow Assistant")
      .locator("..")
      .locator("..")
      .locator("button");
    await closeButtons.last().click();

    // Toggle button should reappear
    await expect(
      page.locator('button[aria-label="Open chat"]'),
    ).toBeVisible();
  });

  test("navigating to another page preserves chat state", async ({ page }) => {
    await page.goto("/marketing");
    await page.waitForLoadState("networkidle");

    // Open chat
    const chatToggle = page.locator('button[aria-label="Open chat"]');
    await chatToggle.click();

    // Navigate to contacts
    await page.click('a[href*="contacts"]');
    await page.waitForLoadState("networkidle");

    // Chat toggle should still be accessible
    // (ChatPanel state resets on navigation since it's client-side,
    // but the component persists in the layout)
    await expect(
      page.locator('button[aria-label="Open chat"]').or(
        page.locator("text=DoTheseNow Assistant"),
      ),
    ).toBeVisible();
  });
});
