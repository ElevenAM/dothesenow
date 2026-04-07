import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// This test uses a FRESH user (no org membership) — does not use global auth state
test.use({ storageState: { cookies: [], origins: [] } });

const ONBOARDING_EMAIL = `e2e-onboard-${Date.now()}@dothesenow.test`;
const ONBOARDING_PASSWORD = "onboard-test-e2e-2024";

test("new user completes onboarding and lands on dashboard", async ({
  page,
}) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    test.skip(true, "Missing Supabase env vars for onboarding test");
    return;
  }

  // Create a fresh user with no org
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase.auth.admin.createUser({
    email: ONBOARDING_EMAIL,
    password: ONBOARDING_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`Failed to create onboarding user: ${error.message}`);

  // Log in through the app
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ONBOARDING_EMAIL);
  await page.getByLabel(/password/i).fill(ONBOARDING_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  // Should redirect to onboarding (no org membership)
  await expect(page).toHaveURL(/\/onboarding/);

  // Complete current onboarding flow (single org name field)
  // TODO [2C]: expand to 3-step wizard (name → industry → budget)
  const orgNameInput = page.getByLabel(/organization name|org name|name/i);
  await expect(orgNameInput).toBeVisible();
  await orgNameInput.fill("E2E Test Org");

  await page.getByRole("button", { name: /create|continue|get started/i }).click();

  // Should land on dashboard
  await expect(page).toHaveURL(/\/marketing|\/[a-z-]+$/);
  await expect(page.getByText("E2E Test Org")).toBeVisible();

  // Cleanup: delete the test user
  const { data: users } = await supabase.auth.admin.listUsers();
  const testUser = users?.users.find((u) => u.email === ONBOARDING_EMAIL);
  if (testUser) {
    await supabase.auth.admin.deleteUser(testUser.id);
  }
});
