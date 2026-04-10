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
import { User, Bot, Briefcase } from "lucide-react";
import type { DailyTask } from "@/lib/daily-tasks/actions";
import { changeTaskExecutor } from "@/lib/daily-tasks/actions";
import type { ExecutorAvailability } from "./tasks-page-client";
import {
  getTaskBlocker,
  dismissBlocker,
  resolveBlockerManually,
} from "@/lib/blockers/actions";
import type { Blocker } from "@/lib/blockers/actions";
import { FreelancerPostDialog } from "./freelancer-post-dialog";

interface TaskDetailSheetProps {
  task: DailyTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  executorAvailability?: ExecutorAvailability;
}

const EXECUTOR_LABELS: Record<string, string> = {
  self: "Self / Teammate",
  n8n: "n8n Automation",
  claude_api: "Claude API",
  freelancer: "Freelancer",
};

const BLOCKER_TYPE_LABELS: Record<
  string,
  { label: string; className: string }
> = {
  knowledge_gap: {
    label: "Knowledge Gap",
    className: "bg-[var(--label-blue-bg)] text-[var(--label-blue-fg)]",
  },
  dependency: {
    label: "Dependency",
    className: "bg-[var(--label-orange-bg)] text-[var(--label-orange-fg)]",
  },
  skill_gap: {
    label: "Skill Gap",
    className: "bg-[var(--label-purple-bg)] text-[var(--label-purple-fg)]",
  },
  resource_constraint: {
    label: "Resource Constraint",
    className: "bg-[var(--label-yellow-bg)] text-[var(--label-yellow-fg)]",
  },
  decision_needed: {
    label: "Decision Needed",
    className: "bg-[var(--label-red-bg)] text-[var(--label-red-fg)]",
  },
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
  executorAvailability,
}: TaskDetailSheetProps) {
  const [blocker, setBlocker] = useState<Blocker | null>(null);
  const [blockerError, setBlockerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [freelancerOpen, setFreelancerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (task && task.status === "blocked" && open) {
      setBlockerError(null);
      getTaskBlocker(task.id)
        .then((b) => {
          if (!cancelled) setBlocker(b);
        })
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
    return () => {
      cancelled = true;
    };
  }, [task?.id, task?.status, open]);

  if (!task) return null;

  const assignee =
    task.assigned_profile?.display_name ||
    task.assigned_profile?.email ||
    "Unassigned";

  const isPendingStatus = task.status === "pending";
  const claudeAvailable =
    executorAvailability?.claude_api?.available !== false;

  function handleDismiss() {
    if (!blocker || isPending) return;
    startTransition(async () => {
      try {
        const result = await dismissBlocker(blocker.id);
        if (result.status === "already_resolved") {
          setBlockerError("This blocker was already resolved");
        } else {
          setBlockerError(null);
        }
        setBlocker(null);
      } catch {
        setBlockerError("Failed to dismiss blocker");
      }
    });
  }

  function handleResolve() {
    if (!blocker || isPending) return;
    startTransition(async () => {
      try {
        const result = await resolveBlockerManually(blocker.id);
        if (result.status === "already_resolved") {
          setBlockerError("This blocker was already resolved");
        } else {
          setBlockerError(null);
        }
        setBlocker(null);
      } catch {
        setBlockerError("Failed to resolve blocker");
      }
    });
  }

  function handleExecutorChange(type: string) {
    if (!task) return;
    startTransition(async () => {
      try {
        await changeTaskExecutor(task.id, type);
      } catch {
        setBlockerError("Failed to change executor. The task may no longer be pending.");
      }
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="text-left">{task.title}</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{task.priority}</Badge>
              <Badge variant="outline">{task.task_type}</Badge>
              <Badge variant="outline">
                {task.status.replace("_", " ")}
              </Badge>
            </div>

            {task.description && (
              <div>
                <p className="text-xs font-medium text-[var(--fgColor-muted)] mb-1">
                  Description
                </p>
                <p className="text-sm whitespace-pre-wrap">
                  {task.description}
                </p>
              </div>
            )}

            {/* How to complete — only for pending tasks */}
            {isPendingStatus && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-[var(--fgColor-muted)] mb-2">
                    How to complete
                  </p>
                  <div className="space-y-2">
                    <ActionCard
                      icon={User}
                      label="Do it yourself"
                      description="Complete this task manually or assign to a teammate"
                      onClick={() => handleExecutorChange("self")}
                      disabled={isPending}
                      active={task.executor_type === "self"}
                    />
                    <ActionCard
                      icon={Bot}
                      label="Run with AI"
                      description={
                        claudeAvailable
                          ? "Have Claude execute this task automatically"
                          : executorAvailability?.claude_api?.hint ??
                            "AI execution unavailable"
                      }
                      onClick={() => handleExecutorChange("claude_api")}
                      disabled={isPending || !claudeAvailable}
                      active={task.executor_type === "claude_api"}
                    />
                    <ActionCard
                      icon={Briefcase}
                      label="Hire a freelancer"
                      description="Post to the marketplace for a freelancer to complete"
                      onClick={() => setFreelancerOpen(true)}
                      disabled={isPending}
                      active={task.executor_type === "freelancer"}
                    />
                  </div>
                </div>
              </>
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
                      <Badge
                        className={`text-[10px] px-1.5 py-0 ${BLOCKER_TYPE_LABELS[blocker.blocker_type]?.className ?? ""}`}
                      >
                        {BLOCKER_TYPE_LABELS[blocker.blocker_type]?.label ??
                          blocker.blocker_type}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0"
                    >
                      {RESOLUTION_STATUS_LABELS[blocker.resolution_status] ??
                        blocker.resolution_status}
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
                <p className="text-xs font-medium text-[var(--fgColor-muted)]">
                  Executor
                </p>
                <p>
                  {EXECUTOR_LABELS[task.executor_type] || task.executor_type}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--fgColor-muted)]">
                  Assigned to
                </p>
                <p>{assignee}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--fgColor-muted)]">
                  Scheduled
                </p>
                <p>{task.scheduled_date}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--fgColor-muted)]">
                  Generated by
                </p>
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

      <FreelancerPostDialog
        task={task}
        open={freelancerOpen}
        onOpenChange={setFreelancerOpen}
      />
    </>
  );
}

function ActionCard({
  icon: Icon,
  label,
  description,
  onClick,
  disabled,
  active,
}: {
  icon: typeof User;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
        active
          ? "border-[var(--fgColor-accent)] bg-[var(--label-blue-bg)]"
          : "border-[var(--borderColor-default)] hover:border-[var(--borderColor-emphasis)] hover:bg-[var(--bgColor-muted)]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0 text-[var(--fgColor-muted)]" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-[var(--fgColor-muted)] truncate">
            {description}
          </p>
        </div>
      </div>
    </button>
  );
}
