"use client";

import { Suspense, useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import {
  User,
  Bot,
  Cpu,
  Briefcase,
  RotateCcw,
  CheckSquare,
  Sparkles,
  FileText,
  CreditCard,
  Loader2,
} from "lucide-react";
import { DatePicker } from "./date-picker";
import { SummaryCards } from "./summary-cards";
import { TaskList } from "./task-list";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskDetailSheet } from "./task-detail-sheet";
import { carryOverTasks, generateDailyTasks } from "@/lib/daily-tasks/actions";
import type { DailyTask, DailyTasksSummary, TeamMember } from "@/lib/daily-tasks/actions";

const EXECUTOR_TABS = [
  { value: "all", label: "All", icon: null },
  { value: "self", label: "You", icon: User },
  { value: "claude_api", label: "Claude", icon: Bot },
  { value: "n8n", label: "n8n", icon: Cpu },
  { value: "freelancer", label: "Freelancer", icon: Briefcase },
  { value: "jasper_api", label: "Jasper", icon: Sparkles },
] as const;

export type ExecutorAvailability = Record<string, { available: boolean; hint?: string }>;

type AutoGenStatus = "ready" | "no_strategy" | "no_credits" | null;

interface TasksPageClientProps {
  tasks: DailyTask[];
  summary: DailyTasksSummary[];
  date: string;
  today: string;
  dept: string;
  members: TeamMember[];
  currentUserId: string;
  executorAvailability: ExecutorAvailability;
  executorTypes?: { value: string; label: string; icon?: string }[];
  autoGenStatus?: AutoGenStatus;
}

const POLL_INTERVAL = 5_000;
const POLL_TIMEOUT = 60_000;

export function TasksPageClient({
  tasks,
  summary,
  date,
  today,
  dept,
  members,
  currentUserId,
  executorAvailability,
  executorTypes,
  autoGenStatus = null,
}: TasksPageClientProps) {
  const router = useRouter();
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<DailyTask | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isCarrying, startCarryTransition] = useTransition();
  const [isGenerating, startGenerateTransition] = useTransition();
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [isManualGenerating, setIsManualGenerating] = useState(false);
  const [genTimedOut, setGenTimedOut] = useState(false);
  const autoGenTriggeredRef = useRef(false);

  const isViewingPast = date < today;

  // Reset auto-gen guard when date or dept changes
  useEffect(() => {
    autoGenTriggeredRef.current = false;
  }, [date, dept]);

  // Auto-generate tasks on first visit when today has no tasks
  useEffect(() => {
    if (
      autoGenStatus !== "ready" ||
      tasks.length > 0 ||
      autoGenTriggeredRef.current
    ) {
      return;
    }
    autoGenTriggeredRef.current = true;
    setIsAutoGenerating(true);

    generateDailyTasks(dept, date, true).catch((err) => {
      setGenerateError(
        err instanceof Error ? err.message : "Failed to generate tasks",
      );
      setIsAutoGenerating(false);
    });
  }, [autoGenStatus, tasks.length, dept, date]);

  // Poll for new tasks while generating (auto or manual)
  useEffect(() => {
    const shouldPoll =
      (isAutoGenerating || isManualGenerating) && tasks.length === 0;
    if (!shouldPoll) {
      // Tasks arrived — stop generating states
      if (isAutoGenerating && tasks.length > 0) {
        setIsAutoGenerating(false);
      }
      if (isManualGenerating && tasks.length > 0) {
        setIsManualGenerating(false);
      }
      return;
    }

    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - startedAt > POLL_TIMEOUT) {
        clearInterval(interval);
        setGenTimedOut(true);
        setIsAutoGenerating(false);
        setIsManualGenerating(false);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [isAutoGenerating, isManualGenerating, tasks.length, router]);

  function handleEditTask(task: DailyTask) {
    setEditingTask(task);
    setEditDialogOpen(true);
  }

  function handleSelectTask(task: DailyTask) {
    setSelectedTask(task);
    setSheetOpen(true);
  }

  function handleCarryOver() {
    startCarryTransition(async () => {
      await carryOverTasks(dept, date);
    });
  }

  function handleGenerate() {
    setGenerateError(null);
    setGenTimedOut(false);
    setIsManualGenerating(true);
    startGenerateTransition(async () => {
      try {
        await generateDailyTasks(dept, date);
      } catch (err) {
        setGenerateError(
          err instanceof Error ? err.message : "Failed to generate tasks",
        );
        setIsManualGenerating(false);
      }
    });
  }

  function filterTasks(executorType: string) {
    if (executorType === "all") return tasks;
    return tasks.filter((t) => t.executor_type === executorType);
  }

  // Count tasks with incomplete status
  const incompleteTasks = tasks.filter((t) =>
    ["pending", "in_progress"].includes(t.status),
  ).length;

  const showGeneratingState =
    (isAutoGenerating || isManualGenerating) && tasks.length === 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Daily Tasks</h1>
          <Suspense>
            <DatePicker date={date} />
          </Suspense>
        </div>
        <div className="flex items-center gap-2">
          {isViewingPast && incompleteTasks > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCarryOver}
              disabled={isCarrying}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {isCarrying
                ? "Carrying..."
                : `Carry Over (${incompleteTasks})`}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            disabled={isGenerating || isAutoGenerating || isManualGenerating}
            className="gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {isGenerating || isAutoGenerating || isManualGenerating
              ? "Generating..."
              : "Generate Tasks"}
          </Button>
          <TaskFormDialog
            dept={dept}
            date={date}
            members={members}
            currentUserId={currentUserId}
            executorAvailability={executorAvailability}
            executorTypes={executorTypes}
          />
        </div>
      </div>

      {/* Generation error */}
      {generateError && (
        <div className="rounded-md border border-[var(--borderColor-danger-emphasis,#cf222e)] bg-[var(--bgColor-danger-muted,#ffebe9)] px-3 py-2 text-sm text-[var(--fgColor-danger,#d1242f)]">
          {generateError}
        </div>
      )}

      {/* Generation timeout */}
      {genTimedOut && tasks.length === 0 && (
        <div className="rounded-md border border-[var(--label-yellow-fg)]/20 bg-[var(--label-yellow-bg)] px-3 py-2 text-sm text-[var(--label-yellow-fg)]">
          Generation is taking longer than expected. Tasks may still appear
          shortly, or you can{" "}
          <button
            type="button"
            onClick={handleGenerate}
            className="font-medium underline underline-offset-2"
          >
            try again
          </button>
          .
        </div>
      )}

      {/* Summary cards */}
      <SummaryCards summary={summary} totalTasks={tasks.length} />

      {/* Task list with executor tabs */}
      {showGeneratingState ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--fgColor-accent)] mb-4" />
          <p className="text-lg font-semibold">
            Generating your daily tasks...
          </p>
          <p className="text-sm text-[var(--fgColor-muted)] mt-1">
            Analyzing your strategy and building today&apos;s task list. This
            usually takes 15-30 seconds.
          </p>
        </div>
      ) : tasks.length === 0 ? (
        <TasksEmptyState
          date={date}
          today={today}
          autoGenStatus={autoGenStatus}
          dept={dept}
        />
      ) : (
        <Card>
          <Tabs defaultValue="all">
            <CardHeader className="pb-0">
              <TabsList>
                {EXECUTOR_TABS.map((tab) => {
                  const count = filterTasks(tab.value).length;
                  if (tab.value !== "all" && count === 0) return null;
                  return (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="gap-1.5"
                    >
                      {tab.icon && <tab.icon className="h-3.5 w-3.5" />}
                      {tab.label}
                      {tab.value !== "all" && (
                        <span className="text-xs text-[var(--fgColor-muted)] ml-0.5">
                          {count}
                        </span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </CardHeader>
            <CardContent className="pt-2">
              {EXECUTOR_TABS.map((tab) => (
                <TabsContent key={tab.value} value={tab.value}>
                  <TaskList
                    tasks={filterTasks(tab.value)}
                    onEditTask={handleEditTask}
                    onSelectTask={handleSelectTask}
                    executorAvailability={executorAvailability}
                  />
                </TabsContent>
              ))}
            </CardContent>
          </Tabs>
        </Card>
      )}

      {/* Edit dialog */}
      <TaskFormDialog
        dept={dept}
        date={date}
        members={members}
        currentUserId={currentUserId}
        executorAvailability={executorAvailability}
        executorTypes={executorTypes}
        editingTask={editingTask}
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingTask(null);
        }}
      />

      {/* Detail sheet */}
      <TaskDetailSheet
        task={selectedTask}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setSelectedTask(null);
        }}
        executorAvailability={executorAvailability}
      />
    </div>
  );
}

function TasksEmptyState({
  date,
  today,
  autoGenStatus,
  dept,
}: {
  date: string;
  today: string;
  autoGenStatus: AutoGenStatus;
  dept: string;
}) {
  if (autoGenStatus === "no_strategy") {
    return (
      <EmptyState
        icon={FileText}
        title="Set up your strategy to get daily tasks"
        description="AI-generated daily tasks require an active marketing strategy. Create one to get started."
        actionLabel="Create Strategy"
        actionHref={`/${dept}/strategy`}
      />
    );
  }

  if (autoGenStatus === "no_credits") {
    return (
      <EmptyState
        icon={CreditCard}
        title="Not enough credits to generate tasks"
        description="Task generation requires AI credits. Add more credits to continue."
        actionLabel="Buy Credits"
        actionHref="/settings/billing"
      />
    );
  }

  return (
    <EmptyState
      icon={CheckSquare}
      title={`No tasks for ${date === today ? "today" : date}`}
      description='Click "Add Task" above to create one, or "Generate Tasks" to auto-generate from your strategy.'
    />
  );
}
