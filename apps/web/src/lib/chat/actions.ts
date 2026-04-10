"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedMembership } from "@/lib/auth-helpers";
import type { ChatMessage } from "@/components/chat/chat-panel";

export interface ChatSessionSummary {
  id: string;
  title: string | null;
  updated_at: string;
}

/**
 * Fetch recent chat sessions for the current user's org.
 */
export async function fetchChatSessions(): Promise<ChatSessionSummary[]> {
  const { org } = await getAuthenticatedMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dtn_chat_sessions")
    .select("id, title, updated_at")
    .eq("org_id", org.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[chat] fetchChatSessions failed:", error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Fetch all messages for a session and reconstruct into ChatMessage[] shape.
 *
 * DB stores separate rows for user, assistant, tool_call, and tool_result.
 * We group tool_call rows that precede an assistant message onto that
 * assistant message's `tool_calls` array.
 */
export async function fetchChatMessages(
  sessionId: string,
): Promise<ChatMessage[]> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("dtn_chat_messages")
    .select("id, role, content, tool_name, tool_input, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[chat] fetchChatMessages failed:", error.message);
    return [];
  }

  if (!rows || rows.length === 0) return [];

  // Reconstruct ChatMessage[] by grouping tool_call rows onto the next assistant message
  const messages: ChatMessage[] = [];
  let pendingToolCalls: ChatMessage["tool_calls"] = [];

  for (const row of rows) {
    if (row.role === "tool_call") {
      pendingToolCalls.push({
        tool_name: row.tool_name ?? "unknown",
        tool_input: (row.tool_input as Record<string, unknown>) ?? {},
        result_preview: row.content.slice(0, 200),
        is_error: false,
      });
    } else if (row.role === "tool_result") {
      // tool_result rows are already captured via tool_call content — skip
      continue;
    } else if (row.role === "assistant") {
      messages.push({
        id: row.id,
        role: "assistant",
        content: row.content,
        tool_calls:
          pendingToolCalls.length > 0 ? pendingToolCalls : undefined,
        created_at: row.created_at,
      });
      pendingToolCalls = [];
    } else {
      // user message
      messages.push({
        id: row.id,
        role: "user",
        content: row.content,
        created_at: row.created_at,
      });
    }
  }

  return messages;
}
