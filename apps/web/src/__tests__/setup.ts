import { vi } from "vitest";

// Mock next/headers cookies
const mockCookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = mockCookieStore.get(name);
      return value !== undefined ? { name, value } : undefined;
    },
    set: (name: string, value: string, _options?: Record<string, unknown>) => {
      mockCookieStore.set(name, value);
    },
    delete: (name: string) => {
      mockCookieStore.delete(name);
    },
  })),
}));

// Export helpers for tests to control the mock cookie store
export function setMockCookie(name: string, value: string) {
  mockCookieStore.set(name, value);
}

export function deleteMockCookie(name: string) {
  mockCookieStore.delete(name);
}

export function clearMockCookies() {
  mockCookieStore.clear();
}

export function getMockCookie(name: string): string | undefined {
  return mockCookieStore.get(name);
}

// Mock @/lib/supabase/server
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock @/lib/supabase/admin
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
