"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const PREFETCH_ROUTES = [
  "/tasks",
  "/contacts",
  "/strategy",
  "/approvals",
  "/pipeline",
  "/results",
];

/**
 * Prefetches dashboard tab routes after the initial page load.
 * Re-prefetches when dept changes (e.g. after org switch).
 * router.prefetch is idempotent so repeated calls are harmless.
 */
export function DashboardPrefetcher({ dept }: { dept: string }) {
  const router = useRouter();

  useEffect(() => {
    const timers = PREFETCH_ROUTES.map((suffix, i) =>
      setTimeout(() => router.prefetch(`/${dept}${suffix}`), 1000 + i * 300),
    );

    return () => timers.forEach(clearTimeout);
  }, [dept, router]);

  return null;
}
