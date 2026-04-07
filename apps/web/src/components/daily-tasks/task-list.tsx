"use client";

import { useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Play,
  SkipForward,
  XCircle,
  Pencil,
} from "lucide-react";
import {
  completeDailyTask,
  skipDailyTask,
  updateDailyTask,
} from "@/lib/daily-tasks/actions";
import type { DailyTask } from "@/lib/daily-tasks/actions";

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-[var(--label-red-bg)] text-[var(--label-red-fg)]",
  high: "bg-[var(--label-orange-bg)] text-[var(--label-orange-fg)]",
  medium: "bg-[var(--label-blue-bg)] text-[var(--label-blue-fg)]",
  low: "bg-[var(--label-default-bg)] text-[var(--label-default-fg)]",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-[var(--label-default-bg)] text-[var(--label-default-fg)]",
  in_progress: "bg-[var(--label-blue-bg)] text-[var(--label-blue-fg)]",
  waiting_approval: "bg-[var(--label-yellow-bg)] text-[var(--label-yellow-fg)]",
  completed: "bg-[var(--label-green-bg)] text-[var(--label-green-fg)]",
  skipped: "bg-[var(--label-default-bg)] text-[var(--label-default-fg)]",
  failed: "bg-[var(--label-red-bg)] text-[var(--label-red-fg)]",
  carried_over: "bg-[var(--label-purple-bg)] text-[var(--label-purple-fg)]",
};

interface TaskListProps {
  tasks: DailyTask[];
  onEditTask: (task: DailyTask) => void;
  onSelectTask: (task: DailyTask) => void;
}

export function TaskList({ tasks, onEditTask, onSelectTask }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No tasks for this group
      </p>
    );
  }

  return (
    <div className="divide-y">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          onEdit={() => onEditTask(task)}
          onSelect={() => onSelectTask(task)}
        />
      ))}
    </div>
  );
}

function TaskRow({
  task,
  onEdit,
  onSelect,
}: {
  task: DailyTask;
  onEdit: () => void;
  onSelect: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const isComplete = task.status === "completed";
  const isTerminal = ["completed", "skipped", "failed", "carried_over"].includes(
    task.status,
  );

  function handleToggle() {
    if (isPending) return;
    startTransition(async () => {
      if (isComplete) {
        await updateDailyTask(task.id, { status: "pending" });
      } else {
        await completeDailyTask(task.id);
      }
    });
  }

  function handleAction(action: string) {
    startTransition(async () => {
      switch (action) {
        case "start":
          await updateDailyTask(task.id, { status: "in_progress" });
          break;
        case "skip":
          await skipDailyTask(task.id);
          break;
        case "fail":
          await updateDailyTask(task.id, { status: "failed" });
          break;
      }
    });
  }

  const assignee =
    task.assigned_profile?.display_name ||
    task.assigned_profile?.email?.split("@")[0] ||
    null;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 group ${isPending ? "opacity-50" : ""} ${isTerminal && !isComplete ? "opacity-60" : ""}`}
    >
      <Checkbox
        checked={isComplete}
        onCheckedChange={handleToggle}
        disabled={isPending || (isTerminal && !isComplete)}
        className="shrink-0"
      />

      <button
        type="button"
        className={`flex-1 text-left text-sm min-w-0 ${isComplete ? "line-through text-muted-foreground" : ""}`}
        onClick={onSelect}
      >
        <span className="truncate block">{task.title}</span>
      </button>

      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[task.priority]}`}>
          {task.priority}
        </Badge>

        {task.status !== "pending" && task.status !== "completed" && (
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[task.status]}`}>
            {task.status.replace("_", " ")}
          </Badge>
        )}

        {assignee && (
          <span className="text-xs text-muted-foreground max-w-[80px] truncate hidden sm:inline">
            {assignee}
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center justify-center rounded-md h-7 w-7 opacity-0 group-hover:opacity-100 hover:bg-muted cursor-pointer border-0 bg-transparent"
          >
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
            {task.status === "pending" && (
              <DropdownMenuItem onClick={() => handleAction("start")}>
                <Play className="mr-2 h-3.5 w-3.5" />
                Start
              </DropdownMenuItem>
            )}
            {!isTerminal && (
              <>
                <DropdownMenuItem onClick={() => handleAction("skip")}>
                  <SkipForward className="mr-2 h-3.5 w-3.5" />
                  Skip
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleAction("fail")}
                  className="text-destructive"
                >
                  <XCircle className="mr-2 h-3.5 w-3.5" />
                  Mark Failed
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
