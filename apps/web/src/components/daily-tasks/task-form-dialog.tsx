"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, ExternalLink } from "lucide-react";
import {
  createDailyTask,
  updateDailyTask,
} from "@/lib/daily-tasks/actions";
import type { DailyTask, TeamMember } from "@/lib/daily-tasks/actions";
import type { ExecutorAvailability } from "./tasks-page-client";

interface TaskFormDialogProps {
  dept: string;
  date: string;
  members: TeamMember[];
  currentUserId: string;
  executorAvailability?: ExecutorAvailability;
  editingTask?: DailyTask | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const TASK_TYPES = [
  { value: "action", label: "Action" },
  { value: "review", label: "Review" },
  { value: "create", label: "Create" },
  { value: "outreach", label: "Outreach" },
  { value: "analysis", label: "Analysis" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const EXECUTOR_TYPES = [
  { value: "self", label: "Self / Teammate" },
  { value: "n8n", label: "n8n Automation" },
  { value: "claude_api", label: "Claude API" },
  { value: "freelancer", label: "Freelancer" },
];

export function TaskFormDialog({
  dept,
  date,
  members,
  currentUserId,
  executorAvailability,
  editingTask,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: TaskFormDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const onOpenChange = controlledOnOpenChange ?? setUncontrolledOpen;

  const [isPending, startTransition] = useTransition();
  const isEditing = !!editingTask;

  const [title, setTitle] = useState(editingTask?.title ?? "");
  const [description, setDescription] = useState(
    editingTask?.description ?? "",
  );
  const [taskType, setTaskType] = useState(
    editingTask?.task_type ?? "action",
  );
  const [priority, setPriority] = useState(
    editingTask?.priority ?? "medium",
  );
  const [executorType, setExecutorType] = useState(
    editingTask?.executor_type ?? "self",
  );
  const [assignedTo, setAssignedTo] = useState(
    editingTask?.assigned_to ?? currentUserId,
  );

  // Reset form when dialog opens with new task
  function resetForm() {
    setTitle("");
    setDescription("");
    setTaskType("action");
    setPriority("medium");
    setExecutorType("self");
    setAssignedTo(currentUserId);
  }

  function handleOpenChange(newOpen: boolean) {
    if (newOpen && !isEditing) {
      resetForm();
    }
    if (newOpen && isEditing && editingTask) {
      setTitle(editingTask.title);
      setDescription(editingTask.description ?? "");
      setTaskType(editingTask.task_type);
      setPriority(editingTask.priority);
      setExecutorType(editingTask.executor_type);
      setAssignedTo(editingTask.assigned_to ?? currentUserId);
    }
    onOpenChange(newOpen);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    startTransition(async () => {
      if (isEditing && editingTask) {
        await updateDailyTask(editingTask.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          task_type: taskType as DailyTask["task_type"],
          priority: priority as DailyTask["priority"],
          executor_type: executorType as DailyTask["executor_type"],
          assigned_to: executorType === "self" ? assignedTo : undefined,
        });
      } else {
        await createDailyTask(dept, {
          title: title.trim(),
          description: description.trim() || undefined,
          task_type: taskType as DailyTask["task_type"],
          priority: priority as DailyTask["priority"],
          executor_type: executorType as DailyTask["executor_type"],
          scheduled_date: date,
          assigned_to: executorType === "self" ? assignedTo : undefined,
        });
      }
      onOpenChange(false);
    });
  }

  const trigger = !isEditing ? (
    <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
      <Plus className="h-4 w-4" />
      Add Task
    </DialogTrigger>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={taskType} onValueChange={(v) => v && setTaskType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => v && setPriority(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Executor</Label>
            <Select value={executorType} onValueChange={(v) => v && setExecutorType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXECUTOR_TYPES.map((e) => {
                  const status = executorAvailability?.[e.value];
                  return (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                      {status && !status.available && (
                        <span className="ml-1.5 text-xs text-muted-foreground">(not configured)</span>
                      )}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {executorAvailability?.[executorType] && !executorAvailability[executorType].available && (
              <p className="text-xs text-[var(--label-yellow-fg)]">
                {executorType === "n8n" ? (
                  <>
                    n8n is not connected yet. Tasks will stay pending for manual completion.{" "}
                    <a
                      href="https://n8n.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 underline hover:opacity-80"
                    >
                      Set up n8n <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                ) : (
                  executorAvailability[executorType].hint
                )}
              </p>
            )}
          </div>

          {executorType === "self" && members.length > 1 && (
            <div className="space-y-2">
              <Label>Assign to</Label>
              <Select value={assignedTo} onValueChange={(v) => v && setAssignedTo(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.displayName || m.email}
                      {m.userId === currentUserId ? " (you)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !title.trim()}>
              {isPending
                ? "Saving..."
                : isEditing
                  ? "Update"
                  : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
