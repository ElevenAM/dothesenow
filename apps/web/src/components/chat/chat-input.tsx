"use client";

import { useState, useRef } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  disabled: boolean;
  creditsRemaining: number;
}

export function ChatInput({
  onSend,
  isLoading,
  disabled,
  creditsRemaining,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit() {
    if (!text.trim() || isLoading || disabled) return;
    onSend(text.trim());
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }

  return (
    <div className="px-4 py-3 sm:px-6">
      {disabled && (
        <p className="mb-2 text-xs text-[var(--fgColor-danger)]">
          No credits remaining. Go to Settings &gt; Billing to add more.
        </p>
      )}
      <div className="mx-auto flex max-w-2xl items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={
            disabled
              ? "No credits"
              : "Type a message... (Shift+Enter for new line)"
          }
          disabled={isLoading || disabled}
          rows={1}
          className="flex-1 resize-none rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] px-3 py-2 text-sm text-[var(--fgColor-default)] placeholder:text-[var(--fgColor-disabled)] focus:border-[var(--fgColor-accent)] focus:bg-[var(--bgColor-default)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!text.trim() || isLoading || disabled}
          className="h-9 w-9 shrink-0 p-0"
        >
          <Send className="h-4 w-4" />
        </Button>
        <span className="shrink-0 text-xs text-[var(--fgColor-muted)]">
          {creditsRemaining} credits
        </span>
      </div>
    </div>
  );
}
