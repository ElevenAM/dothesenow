"use client";

import type { RefObject } from "react";
import type { ChatMessage } from "./chat-panel";
import type { DailyTask } from "@dothesenow/types";
import { ToolCallCard } from "./tool-call-card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckSquare, ArrowRight } from "lucide-react";

interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  pendingTasks: Pick<DailyTask, "id" | "title" | "task_type" | "priority" | "status">[];
  onTaskClick: (task: Pick<DailyTask, "id" | "title" | "task_type" | "priority" | "status">) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-[var(--fgColor-danger)]",
  high: "text-[var(--fgColor-severe)]",
  medium: "text-[var(--fgColor-attention)]",
  low: "text-[var(--fgColor-muted)]",
};

export function ChatMessages({
  messages,
  isLoading,
  messagesEndRef,
  pendingTasks,
  onTaskClick,
}: ChatMessagesProps) {
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6">
        <div className="w-full max-w-lg space-y-6 text-center">
          <div>
            <h2 className="text-lg font-semibold text-[var(--fgColor-default)]">
              What did you get done today?
            </h2>
            <p className="mt-1 text-sm text-[var(--fgColor-muted)]">
              Report results, update contacts, manage tasks, or ask about your strategy.
            </p>
          </div>

          {/* Pending tasks as clickable prompts */}
          {pendingTasks.length > 0 && (
            <div className="space-y-2 text-left">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--fgColor-muted)]">
                Today&apos;s Tasks
              </h3>
              <div className="space-y-1.5">
                {pendingTasks.slice(0, 5).map((task) => (
                  <button
                    key={task.id}
                    onClick={() => onTaskClick(task)}
                    className="flex w-full items-center gap-3 rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] px-3 py-2.5 text-left text-sm transition-colors hover:border-[var(--fgColor-accent)] hover:bg-[var(--bgColor-muted)] group"
                  >
                    <CheckSquare className={`h-4 w-4 shrink-0 ${PRIORITY_COLORS[task.priority] ?? "text-[var(--fgColor-muted)]"}`} />
                    <span className="flex-1 truncate text-[var(--fgColor-default)]">
                      {task.title}
                    </span>
                    <span className="text-xs text-[var(--fgColor-muted)]">
                      {task.task_type}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--fgColor-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick action examples */}
          <div className="space-y-2 text-left">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--fgColor-muted)]">
              Try saying
            </h3>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {[
                "I made 3 Reddit posts and got 15 upvotes",
                "Add John Smith from ACME as a lead",
                "What are my tasks today?",
                "Move Jane to customer status",
              ].map((example) => (
                <p
                  key={example}
                  className="rounded-md border border-[var(--borderColor-muted)] px-3 py-2 text-xs text-[var(--fgColor-muted)] italic"
                >
                  &ldquo;{example}&rdquo;
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-md px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-[var(--fgColor-accent)] text-white"
                  : "bg-[var(--bgColor-muted)] text-[var(--fgColor-default)]"
              }`}
            >
              {/* Tool calls */}
              {msg.tool_calls &&
                msg.tool_calls.length > 0 &&
                msg.role === "assistant" && (
                  <div className="mb-2 space-y-1.5">
                    {msg.tool_calls.map((tc, i) => (
                      <ToolCallCard key={`${msg.id}-tc-${i}`} toolCall={tc} />
                    ))}
                  </div>
                )}

              <div className="whitespace-pre-wrap break-words">
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] space-y-2 rounded-md bg-[var(--bgColor-muted)] px-3 py-2">
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
