"use server";

import { cookies } from "next/headers";

const COOKIE_NAME = "dtn_active_org";
const MAX_AGE = 365 * 24 * 60 * 60; // 1 year

export async function getActiveOrgId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

export async function setActiveOrgId(orgId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, orgId, {
    path: "/",
    sameSite: "lax",
    maxAge: MAX_AGE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearActiveOrgId(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
