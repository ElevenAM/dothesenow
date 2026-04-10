"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench, AlertCircle } from "lucide-react";

interface ToolCallCardProps {
  toolCall: {
    tool_name: string;
    tool_input: Record<string, unknown>;
    result_preview: string;
    is_error: boolean;
  };
}

const TOOL_LABELS: Record<string, string> = {
  get_daily_tasks: "Checked tasks",
  create_daily_task: "Created task",
  update_daily_task: "Updated task",
  report_task_result: "Recorded results",
  get_task_context: "Loaded task context",
  generate_daily_tasks: "Generated task plan",
  carry_over_tasks: "Carried over tasks",
  search_contacts: "Searched contacts",
  add_contact: "Added contact",
  update_contact: "Updated contact",
  log_outreach: "Logged outreach",
  update_outreach: "Updated outreach",
  get_outreach_history: "Checked outreach history",
  get_pipeline_summary: "Loaded pipeline",
  get_strategy_doc: "Read strategy",
  get_strategy_docs: "Read strategies",
  update_strategy_doc: "Updated strategy",
  search_strategy_docs: "Searched strategies",
  submit_for_approval: "Submitted for approval",
  list_pending_approvals: "Checked approvals",
  review_approval: "Reviewed approval",
};

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const label = TOOL_LABELS[toolCall.tool_name] ?? toolCall.tool_name;

  return (
    <button
      onClick={() => setIsExpanded(!isExpanded)}
      className="w-full rounded border border-[var(--borderColor-muted)] bg-[var(--bgColor-default)] px-2 py-1.5 text-left text-xs"
    >
      <div className="flex items-center gap-1.5">
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-[var(--fgColor-muted)]" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-[var(--fgColor-muted)]" />
        )}
        {toolCall.is_error ? (
          <AlertCircle className="h-3 w-3 shrink-0 text-[var(--fgColor-danger)]" />
        ) : (
          <Wrench className="h-3 w-3 shrink-0 text-[var(--fgColor-accent)]" />
        )}
        <span
          className={`font-medium ${toolCall.is_error ? "text-[var(--fgColor-danger)]" : "text-[var(--fgColor-muted)]"}`}
        >
          {label}
        </span>
      </div>

      {isExpanded && (
        <div className="mt-1.5 space-y-1 pl-5">
          {Object.keys(toolCall.tool_input).length > 0 && (
            <pre className="overflow-x-auto rounded bg-[var(--bgColor-muted)] p-1.5 text-[10px] font-mono text-[var(--fgColor-muted)]">
              {JSON.stringify(toolCall.tool_input, null, 2)}
            </pre>
          )}
          <p className="text-[10px] text-[var(--fgColor-muted)]">
            {toolCall.result_preview}
            {toolCall.result_preview.length >= 200 && "..."}
          </p>
        </div>
      )}
    </button>
  );
}
