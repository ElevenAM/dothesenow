"use client";

import { useEffect, useState, useRef } from "react";

/**
 * Thin progress bar at the top of the viewport during route transitions.
 * Works by detecting when the document is fetching RSC payloads (soft nav).
 *
 * Renders a fixed bar that animates from 0% → 80% while loading, then
 * snaps to 100% and fades out on completion.
 */
export function NavigationProgress() {
  const [state, setState] = useState<"idle" | "loading" | "completing">("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Respect prefers-reduced-motion — skip animation entirely
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) return;

    // Intercept fetch to detect RSC navigations (Next.js uses fetch for soft nav)
    const originalFetch = window.fetch;
    let activeCount = 0;

    window.fetch = async (...args) => {
      const input = args[0];
      const isRSC =
        (typeof input === "string" && input.includes("_rsc")) ||
        (input instanceof Request &&
          (input.headers.get("RSC") === "1" ||
            input.url.includes("_rsc")));

      if (!isRSC) return originalFetch(...args);

      activeCount++;
      if (activeCount === 1) {
        // Small delay to avoid flashing on instant navigations
        timeoutRef.current = setTimeout(() => {
          setState("loading");
        }, 100);
      }

      try {
        return await originalFetch(...args);
      } finally {
        activeCount--;
        if (activeCount === 0) {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          setState("completing");
          setTimeout(() => setState("idle"), 300);
        }
      }
    };

    return () => {
      window.fetch = originalFetch;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (state === "idle") return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5">
      <div
        className="h-full bg-[var(--fgColor-accent)] transition-all"
        style={{
          width: state === "loading" ? "80%" : "100%",
          transitionDuration: state === "loading" ? "8s" : "150ms",
          transitionTimingFunction:
            state === "loading"
              ? "cubic-bezier(0.4, 0, 0.2, 1)"
              : "ease-out",
          opacity: state === "completing" ? 0 : 1,
        }}
      />
    </div>
  );
}
