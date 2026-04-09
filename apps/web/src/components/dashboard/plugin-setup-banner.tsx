"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Puzzle } from "lucide-react";

const DISMISS_KEY = "dtn_plugin_banner_dismissed";

export function PluginSetupBanner({ apiKeyCount }: { apiKeyCount: number }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "true");
  }, []);

  if (dismissed || apiKeyCount > 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] px-4 py-3">
      <Puzzle className="h-5 w-5 shrink-0 text-[var(--fgColor-accent)]" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Connect Claude to your workspace</p>
        <p className="text-xs text-[var(--fgColor-muted)]">
          Manage tasks, update strategies, and query your CRM — all from Claude.
        </p>
      </div>
      <Link
        href="/settings/integrations/claude-plugin"
        className="inline-flex shrink-0 items-center rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--bgColor-muted)] transition-colors"
      >
        Set up
      </Link>
      <button
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "true");
          setDismissed(true);
        }}
        className="shrink-0 rounded p-1 text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)] transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
