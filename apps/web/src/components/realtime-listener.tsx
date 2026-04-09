"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { invalidateCacheForTable } from "@/lib/cache-actions";

interface RealtimeListenerProps {
  table: string;
  orgId: string;
  children: React.ReactNode;
}

export function RealtimeListener({ table, orgId, children }: RealtimeListenerProps) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced refresh: coalesce rapid change events into a single refresh.
  // Invalidates the relevant cache tag (marking it stale) before triggering
  // router.refresh() so the RSC re-render regenerates from the database.
  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      await invalidateCacheForTable(table, orgId);
      router.refresh();
    }, 500);
  }, [router, table, orgId]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`${table}-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `org_id=eq.${orgId}`,
        },
        scheduleRefresh,
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          console.error(`[realtime] Channel error for ${table}:`, err?.message);
        }
        if (status === "TIMED_OUT") {
          console.warn(`[realtime] Channel timed out for ${table}, retrying...`);
        }
      });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [table, orgId, scheduleRefresh]);

  return <>{children}</>;
}
