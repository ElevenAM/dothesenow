"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Terminal } from "lucide-react";

interface Command {
  command: string;
  description: string;
  example: string;
}

const COMMAND_GROUPS: { title: string; commands: Command[] }[] = [
  {
    title: "Tasks",
    commands: [
      {
        command: "Show my tasks",
        description: "List today's pending and in-progress tasks",
        example: "What are my tasks today?",
      },
      {
        command: "Complete a task",
        description: "Mark a task done and record results",
        example: "I finished the Reddit posts. Got 15 upvotes total.",
      },
      {
        command: "Report results",
        description: "Record structured metrics for a task",
        example: "Post 1 got 15 upvotes, Post 2 got 23, Post 3 got 7",
      },
      {
        command: "Get task context",
        description: "See the strategy, campaign, and past results for a task",
        example: "Give me context for the outreach task",
      },
    ],
  },
  {
    title: "Contacts",
    commands: [
      {
        command: "Add a contact",
        description: "Create a new CRM contact",
        example: "Add John Smith from ACME Corp as a lead",
      },
      {
        command: "Update a contact",
        description: "Change status, lifecycle stage, or other fields",
        example: "Move Jane Doe to customer status",
      },
      {
        command: "Log outreach",
        description: "Record that you contacted someone",
        example: "I sent Mike an email about the partnership",
      },
      {
        command: "Search contacts",
        description: "Find contacts by name, company, or filters",
        example: "Show me all leads from Reddit",
      },
    ],
  },
  {
    title: "Strategy & Reporting",
    commands: [
      {
        command: "View strategy",
        description: "Read your active strategy documents",
        example: "What's our current Reddit strategy?",
      },
      {
        command: "Pipeline summary",
        description: "See contact counts by lifecycle stage",
        example: "Show me the pipeline breakdown",
      },
      {
        command: "Outreach history",
        description: "Review recent outreach activity",
        example: "What outreach did I do this week?",
      },
    ],
  },
];

export function CommandsSheet() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-t border-[var(--borderColor-muted)] px-4 py-2 sm:px-6">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="mx-auto flex max-w-2xl items-center gap-1.5 text-xs text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)] transition-colors"
      >
        <Terminal className="h-3 w-3" />
        <span>See commands</span>
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>

      {isExpanded && (
        <div className="mx-auto mt-3 max-w-2xl space-y-4 pb-2">
          {COMMAND_GROUPS.map((group) => (
            <div key={group.title}>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--fgColor-muted)]">
                {group.title}
              </h4>
              <div className="space-y-1">
                {group.commands.map((cmd) => (
                  <div
                    key={cmd.command}
                    className="flex items-start gap-3 rounded-md px-2 py-1.5 text-xs"
                  >
                    <span className="w-28 shrink-0 font-medium text-[var(--fgColor-default)]">
                      {cmd.command}
                    </span>
                    <span className="flex-1 text-[var(--fgColor-muted)]">
                      {cmd.description}
                    </span>
                    <span className="hidden sm:block w-48 shrink-0 italic text-[var(--fgColor-disabled)] truncate">
                      &ldquo;{cmd.example}&rdquo;
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
