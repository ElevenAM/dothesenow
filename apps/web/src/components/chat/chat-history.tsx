"use client";

import { Plus, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatSessionSummary } from "@/lib/chat/actions";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

interface ChatHistoryProps {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

export function ChatHistory({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
}: ChatHistoryProps) {
  return (
    <div className="flex h-full flex-col border-r border-[var(--borderColor-default)] bg-[var(--bgColor-default)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--borderColor-default)] px-3 py-3">
        <h2 className="text-sm font-semibold text-[var(--fgColor-default)]">
          History
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewChat}
          className="h-7 gap-1.5 px-2 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
            <MessageSquare className="h-8 w-8 text-[var(--fgColor-disabled)]" />
            <p className="text-xs text-[var(--fgColor-muted)]">
              No conversations yet
            </p>
          </div>
        ) : (
          <div className="py-1">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors ${
                  activeSessionId === session.id
                    ? "bg-[var(--bgColor-muted)] text-[var(--fgColor-default)]"
                    : "text-[var(--fgColor-default)] hover:bg-[var(--bgColor-muted)]"
                }`}
              >
                <span className="truncate text-sm">
                  {session.title || "Untitled"}
                </span>
                <span className="text-xs text-[var(--fgColor-muted)]">
                  {relativeTime(session.updated_at)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
