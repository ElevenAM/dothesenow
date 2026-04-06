import { cookies } from "next/headers";

export const ORG_COOKIE_NAME = "dtn_active_org";
const LEGACY_COOKIE_NAME = "dtn_current_org";

export const COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  maxAge: 365 * 24 * 60 * 60, // 1 year
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};

export async function getActiveOrgId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(ORG_COOKIE_NAME)?.value;
  if (value) return value;

  // Read-only fallback: return legacy cookie value without writing.
  // Cookie migration happens in setActiveOrgId (called from server actions).
  const legacyValue = cookieStore.get(LEGACY_COOKIE_NAME)?.value;
  if (legacyValue) return legacyValue;

  return null;
}

/**
 * Migrate legacy cookie to new name and set the active org.
 * Must only be called from Server Actions or Route Handlers.
 */
export async function migrateAndSetActiveOrgId(orgId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE_NAME, orgId, COOKIE_OPTIONS);
  // Clean up legacy cookie if it exists
  if (cookieStore.get(LEGACY_COOKIE_NAME)?.value) {
    cookieStore.delete(LEGACY_COOKIE_NAME);
  }
}

export async function setActiveOrgId(orgId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE_NAME, orgId, COOKIE_OPTIONS);
}

export async function clearActiveOrgId(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ORG_COOKIE_NAME);
}
