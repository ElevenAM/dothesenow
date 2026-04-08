"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { DailyTask } from "@/lib/daily-tasks/actions";
import {
  getTaskBlocker,
  dismissBlocker,
  resolveBlockerManually,
} from "@/lib/blockers/actions";
import type { Blocker } from "@/lib/blockers/actions";

interface TaskDetailSheetProps {
  task: DailyTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EXECUTOR_LABELS: Record<string, string> = {
  self: "Self / Teammate",
  n8n: "n8n Automation",
  claude_api: "Claude API",
  freelancer: "Freelancer",
};

const BLOCKER_TYPE_LABELS: Record<string, { label: string; className: string }> = {
  knowledge_gap: { label: "Knowledge Gap", className: "bg-[var(--label-blue-bg)] text-[var(--label-blue-fg)]" },
  dependency: { label: "Dependency", className: "bg-[var(--label-orange-bg)] text-[var(--label-orange-fg)]" },
  skill_gap: { label: "Skill Gap", className: "bg-[var(--label-purple-bg)] text-[var(--label-purple-fg)]" },
  resource_constraint: { label: "Resource Constraint", className: "bg-[var(--label-yellow-bg)] text-[var(--label-yellow-fg)]" },
  decision_needed: { label: "Decision Needed", className: "bg-[var(--label-red-bg)] text-[var(--label-red-fg)]" },
};

const RESOLUTION_STATUS_LABELS: Record<string, string> = {
  reported: "Reported",
  classifying: "Classifying...",
  classified: "Classified",
  resolving: "Resolving...",
  resolved: "Resolved",
  escalated: "Escalated",
  dismissed: "Dismissed",
  failed: "Failed",
};

export function TaskDetailSheet({
  task,
  open,
  onOpenChange,
}: TaskDetailSheetProps) {
  const [blocker, setBlocker] = useState<Blocker | null>(null);
  const [blockerError, setBlockerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    if (task && task.status === "blocked" && open) {
      setBlockerError(null);
      getTaskBlocker(task.id)
        .then((b) => { if (!cancelled) setBlocker(b); })
        .catch(() => {
          if (!cancelled) {
            setBlocker(null);
            setBlockerError("Failed to load blocker details");
          }
        });
    } else {
      setBlocker(null);
      setBlockerError(null);
    }
    return () => { cancelled = true; };
  }, [task?.id, task?.status, open]);

  if (!task) return null;

  const assignee =
    task.assigned_profile?.display_name ||
    task.assigned_profile?.email ||
    "Unassigned";

  function handleDismiss() {
    if (!blocker || isPending) return;
    startTransition(async () => {
      try {
        await dismissBlocker(blocker.id);
        setBlocker(null);
        setBlockerError(null);
      } catch {
        setBlockerError("Failed to dismiss blocker");
      }
    });
  }

  function handleResolve() {
    if (!blocker || isPending) return;
    startTransition(async () => {
      try {
        await resolveBlockerManually(blocker.id);
        setBlocker(null);
        setBlockerError(null);
      } catch {
        setBlockerError("Failed to resolve blocker");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-left">{task.title}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{task.priority}</Badge>
            <Badge variant="outline">{task.task_type}</Badge>
            <Badge variant="outline">{task.status.replace("_", " ")}</Badge>
          </div>

          {task.description && (
            <div>
              <p className="text-xs font-medium text-[var(--fgColor-muted)] mb-1">
                Description
              </p>
              <p className="text-sm whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {task.status === "blocked" && blocker && (
            <>
              <Separator />
              <div className="rounded-md border border-[var(--fgColor-severe)]/20 bg-[var(--label-orange-bg)] p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-[var(--fgColor-severe)]">
                    Blocker
                  </p>
                  {blocker.blocker_type && (
                    <Badge className={`text-[10px] px-1.5 py-0 ${BLOCKER_TYPE_LABELS[blocker.blocker_type]?.className ?? ""}`}>
                      {BLOCKER_TYPE_LABELS[blocker.blocker_type]?.label ?? blocker.blocker_type}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {RESOLUTION_STATUS_LABELS[blocker.resolution_status] ?? blocker.resolution_status}
                  </Badge>
                </div>

                <p className="text-sm">{blocker.description}</p>

                {blocker.classification_reasoning && (
                  <div>
                    <p className="text-xs font-medium text-[var(--fgColor-muted)] mb-0.5">
                      Classification reasoning
                    </p>
                    <p className="text-xs text-[var(--fgColor-muted)]">
                      {blocker.classification_reasoning}
                    </p>
                  </div>
                )}

                {blocker.resolution_output && (
                  <div>
                    <p className="text-xs font-medium text-[var(--fgColor-muted)] mb-0.5">
                      Resolution
                    </p>
                    <p className="text-sm whitespace-pre-wrap">
                      {blocker.resolution_output}
                    </p>
                  </div>
                )}

                {blocker.escalation_level > 0 && (
                  <p className="text-xs text-[var(--fgColor-severe)]">
                    Escalation level: {blocker.escalation_level}/3
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDismiss}
                    disabled={isPending}
                  >
                    {isPending ? "..." : "Dismiss Blocker"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleResolve}
                    disabled={isPending}
                  >
                    {isPending ? "..." : "Resolve Manually"}
                  </Button>
                </div>
              </div>
            </>
          )}

          {task.status === "blocked" && !blocker && (
            <>
              <Separator />
              <div className="rounded-md border p-3">
                <p className="text-xs text-[var(--fgColor-muted)]">
                  {blockerError ?? "Classifying blocker..."}
                </p>
              </div>
            </>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs font-medium text-[var(--fgColor-muted)]">Executor</p>
              <p>{EXECUTOR_LABELS[task.executor_type] || task.executor_type}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--fgColor-muted)]">Assigned to</p>
              <p>{assignee}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--fgColor-muted)]">Scheduled</p>
              <p>{task.scheduled_date}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--fgColor-muted)]">Generated by</p>
              <p className="capitalize">{task.generated_by}</p>
            </div>
          </div>

          {task.completed_at && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-medium text-[var(--fgColor-muted)] mb-1">
                  Completed at
                </p>
                <p className="text-sm">
                  {new Date(task.completed_at).toLocaleString()}
                </p>
              </div>
            </>
          )}

          {task.outcome_notes && (
            <div>
              <p className="text-xs font-medium text-[var(--fgColor-muted)] mb-1">
                Outcome Notes
              </p>
              <p className="text-sm whitespace-pre-wrap">
                {task.outcome_notes}
              </p>
            </div>
          )}

          {task.source_strategy && (
            <div>
              <p className="text-xs font-medium text-[var(--fgColor-muted)] mb-1">
                Source Strategy
              </p>
              <p className="text-sm">{task.source_strategy}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
