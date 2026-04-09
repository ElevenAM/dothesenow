import { test as setup, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import fs from "node:fs";

const STORAGE_STATE = path.join(__dirname, "../.auth/user.json");

const TEST_EMAIL = process.env.TEST_USER_EMAIL;

if (!TEST_EMAIL) {
  throw new Error(
    "Missing TEST_USER_EMAIL in environment. " +
      "Create apps/web/.env.test with this value."
  );
}

setup("authenticate", async ({ page }) => {
  // Ensure auth directory exists
  const authDir = path.dirname(STORAGE_STATE);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Create or reuse test user via Supabase admin API
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment. " +
        "Create apps/web/.env.test with these values."
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create test user (idempotent — catches "already exists")
  const { error: createError } = await supabase.auth.admin.createUser({
    email: TEST_EMAIL,
    email_confirm: true,
  });

  if (createError && !createError.message.includes("already been registered")) {
    throw new Error(`Failed to create test user: ${createError.message}`);
  }

  // Authenticate via dev auto-login route (sets session cookies without email)
  await page.goto(`/api/dev/login?email=${encodeURIComponent(TEST_EMAIL)}`);

  // Wait for redirect away from the dev login route
  await expect(page).not.toHaveURL(/\/api\/dev\/login/);

  // Save auth state for other test projects
  await page.context().storageState({ path: STORAGE_STATE });
});
