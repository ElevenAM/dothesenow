import { test, expect } from "@playwright/test";

test.describe("task flow", () => {
  test("navigate to tasks, create a task, see it in list", async ({ page }) => {
    // Navigate to tasks page
    await page.goto("/marketing/tasks");

    // Verify page loads with heading
    await expect(page.getByRole("heading", { name: /daily tasks/i })).toBeVisible();

    // Click "Add Task" button
    await page.getByRole("button", { name: /add task/i }).click();

    // Fill in the task form
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel(/title|name/i).fill("E2E Smoke Test Task");

    // Submit the form
    await dialog.getByRole("button", { name: /create|save|add/i }).click();

    // Dialog should close
    await expect(dialog).not.toBeVisible();

    // Task should appear in the list
    await expect(page.getByText("E2E Smoke Test Task")).toBeVisible();
  });
});
