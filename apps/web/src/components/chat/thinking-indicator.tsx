"use client";

export function ThinkingIndicator() {
  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="flex items-center gap-2 rounded-md bg-[var(--bgColor-muted)] px-3 py-2">
        <span className="flex items-center gap-1" aria-hidden="true">
          <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--fgColor-accent)]" style={{ animationDelay: "0ms" }} />
          <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--fgColor-accent)]" style={{ animationDelay: "150ms" }} />
          <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--fgColor-accent)]" style={{ animationDelay: "300ms" }} />
        </span>
        <span className="text-xs font-medium text-[var(--fgColor-muted)]">
          DTN is working...
        </span>
        <span className="sr-only">DTN is working on your request</span>
      </div>
    </div>
  );
}
