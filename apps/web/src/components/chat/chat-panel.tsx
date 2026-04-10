"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";
import { CommandsSheet } from "./commands-sheet";
import { useCredits } from "@/contexts/credits-context";
import type { DailyTask } from "@dothesenow/types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tool_calls?: Array<{
    tool_name: string;
    tool_input: Record<string, unknown>;
    result_preview: string;
    is_error: boolean;
  }>;
  created_at: string;
}

interface ChatPanelProps {
  pendingTasks: Pick<DailyTask, "id" | "title" | "task_type" | "priority" | "status">[];
  initialSessionId?: string | null;
  initialMessages?: ChatMessage[];
  onSessionCreated?: (sessionId: string, title: string) => void;
  isLoadingHistory?: boolean;
}

export function ChatPanel({
  pendingTasks,
  initialSessionId,
  initialMessages,
  onSessionCreated,
  isLoadingHistory,
}: ChatPanelProps) {
  const { credits, decrementCredits, refreshCredits } = useCredits();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  async function handleSend(text: string) {
    if (!text.trim() || isLoading || credits <= 0) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/v1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          session_id: sessionId,
          history,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));

        if (res.status === 402) {
          refreshCredits();
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content:
                "You've run out of credits. Visit Settings > Billing to add more.",
              created_at: new Date().toISOString(),
            },
          ]);
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Error: ${err.error ?? "Something went wrong"}`,
            created_at: new Date().toISOString(),
          },
        ]);
        return;
      }

      const data = await res.json();

      if (data.session_id && !sessionId) {
        setSessionId(data.session_id);
        onSessionCreated?.(data.session_id, text.slice(0, 100));
      }

      decrementCredits(data.credits_used ?? 1);

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.message,
        tool_calls: data.tool_calls,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Failed to connect. Please try again.",
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chat area */}
      <div className="relative flex-1 overflow-hidden">
        {isLoadingHistory && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bgColor-default)]/80">
            <p className="text-sm text-[var(--fgColor-muted)]">Loading conversation...</p>
          </div>
        )}
        <ChatMessages
          messages={messages}
          isLoading={isLoading}
          messagesEndRef={messagesEndRef}
          pendingTasks={pendingTasks}
          onTaskClick={(task) =>
            handleSend(`I'm working on: "${task.title}". What should I do?`)
          }
        />
      </div>

      {/* Input + commands */}
      <div className="border-t border-[var(--borderColor-default)] bg-[var(--bgColor-default)]">
        <ChatInput
          onSend={handleSend}
          isLoading={isLoading}
          disabled={credits <= 0}
          creditsRemaining={credits}
        />
        <CommandsSheet />
      </div>
    </div>
  );
}
