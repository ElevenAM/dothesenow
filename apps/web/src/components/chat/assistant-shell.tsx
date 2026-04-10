"use client";

import { useState, useCallback, useTransition } from "react";
import { ChatHistory } from "./chat-history";
import { ChatPanel } from "./chat-panel";
import {
  fetchChatMessages,
  type ChatSessionSummary,
} from "@/lib/chat/actions";
import type { ChatMessage } from "./chat-panel";
import type { DailyTask } from "@dothesenow/types";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AssistantShellProps {
  initialSessions: ChatSessionSummary[];
  pendingTasks: Pick<
    DailyTask,
    "id" | "title" | "task_type" | "priority" | "status"
  >[];
}

export function AssistantShell({
  initialSessions,
  pendingTasks,
}: AssistantShellProps) {
  const [sessions, setSessions] =
    useState<ChatSessionSummary[]>(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loadedMessages, setLoadedMessages] = useState<ChatMessage[] | null>(
    null,
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isPending, startTransition] = useTransition();

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (sessionId === activeSessionId) return;
      startTransition(async () => {
        const messages = await fetchChatMessages(sessionId);
        setActiveSessionId(sessionId);
        setLoadedMessages(messages);
      });
    },
    [activeSessionId],
  );

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setLoadedMessages(null);
  }, []);

  // Called by ChatPanel when a new session is created (first message sent).
  // Don't change activeSessionId here — that would change the `key` prop
  // and remount ChatPanel, losing the in-progress conversation.
  const handleSessionCreated = useCallback(
    (_sessionId: string, title: string) => {
      setSessions((prev) => {
        if (prev.some((s) => s.id === _sessionId)) return prev;
        return [
          { id: _sessionId, title, updated_at: new Date().toISOString() },
          ...prev,
        ];
      });
    },
    [],
  );

  return (
    <div className="flex h-full">
      {/* Toggle button when sidebar is closed */}
      {!sidebarOpen && (
        <div className="flex items-start border-r border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(true)}
            className="h-7 w-7 p-0"
            aria-label="Open chat history"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* History sidebar */}
      {sidebarOpen && (
        <div className="w-64 shrink-0">
          <div className="relative h-full">
            <ChatHistory
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={handleSelectSession}
              onNewChat={handleNewChat}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(false)}
              className="absolute right-2 top-2.5 h-7 w-7 p-0"
              aria-label="Close chat history"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1">
        <ChatPanel
          key={activeSessionId ?? "new"}
          pendingTasks={pendingTasks}
          initialSessionId={activeSessionId}
          initialMessages={loadedMessages ?? undefined}
          onSessionCreated={handleSessionCreated}
          isLoadingHistory={isPending}
        />
      </div>
    </div>
  );
}
