"use client";

import { Suspense, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { User, Bot, Cpu, Briefcase, RotateCcw, CheckSquare } from "lucide-react";
import { DatePicker } from "./date-picker";
import { SummaryCards } from "./summary-cards";
import { TaskList } from "./task-list";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskDetailSheet } from "./task-detail-sheet";
import { carryOverTasks } from "@/lib/daily-tasks/actions";
import type { DailyTask, DailyTasksSummary, TeamMember } from "@/lib/daily-tasks/actions";

const EXECUTOR_TABS = [
  { value: "all", label: "All", icon: null },
  { value: "self", label: "You", icon: User },
  { value: "n8n", label: "n8n", icon: Cpu },
  { value: "claude_api", label: "Claude", icon: Bot },
  { value: "freelancer", label: "Freelancer", icon: Briefcase },
] as const;

export type ExecutorAvailability = Record<string, { available: boolean; hint?: string }>;

interface TasksPageClientProps {
  tasks: DailyTask[];
  summary: DailyTasksSummary[];
  date: string;
  dept: string;
  members: TeamMember[];
  currentUserId: string;
  executorAvailability: ExecutorAvailability;
}

export function TasksPageClient({
  tasks,
  summary,
  date,
  dept,
  members,
  currentUserId,
  executorAvailability,
}: TasksPageClientProps) {
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<DailyTask | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isCarrying, startCarryTransition] = useTransition();

  const today = new Date().toISOString().split("T")[0];
  const isViewingPast = date < today;

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

  function filterTasks(executorType: string) {
    if (executorType === "all") return tasks;
    return tasks.filter((t) => t.executor_type === executorType);
  }

  // Count tasks with incomplete status
  const incompleteTasks = tasks.filter((t) =>
    ["pending", "in_progress"].includes(t.status),
  ).length;

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
          <TaskFormDialog
            dept={dept}
            date={date}
            members={members}
            currentUserId={currentUserId}
            executorAvailability={executorAvailability}
          />
        </div>
      </div>

      {/* Summary cards */}
      <SummaryCards summary={summary} totalTasks={tasks.length} />

      {/* Task list with executor tabs */}
      {tasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title={`No tasks for ${date === today ? "today" : date}`}
          description='Click "Add Task" above to create one.'
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
                        <span className="text-xs text-muted-foreground ml-0.5">
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
      />
    </div>
  );
}
