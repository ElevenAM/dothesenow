"use client";

import React, { useCallback, useState, useTransition } from "react";
import {
  FlaskConical,
  Play,
  CheckCircle2,
  Trophy,
  XCircle,
  Plus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createNewExperiment,
  updateExperimentStatusAction,
  getExperimentResultsData,
} from "@/lib/results/actions";
import type { Experiment, ExperimentResult } from "@dothesenow/types";
import type { ExperimentStatus } from "@dothesenow/types";

const STATUS_BADGE: Record<
  string,
  { variant: "default" | "blue" | "purple" | "green" | "red"; label: string }
> = {
  backlog: { variant: "default", label: "Backlog" },
  running: { variant: "blue", label: "Running" },
  completed: { variant: "purple", label: "Completed" },
  won: { variant: "green", label: "Won" },
  lost: { variant: "red", label: "Lost" },
};

const ALL_STATUSES: ExperimentStatus[] = [
  "backlog",
  "running",
  "completed",
  "won",
  "lost",
];

function parseChannelName(ref: string | null): string {
  if (!ref) return "—";
  const name = ref.includes(".") ? ref.split(".").pop()! : ref;
  return name.replace(/([a-z])([A-Z])/g, "$1 $2");
}

interface ExperimentTrackerProps {
  experiments: Experiment[];
}

export function ExperimentTracker({
  experiments: initialExperiments,
}: ExperimentTrackerProps) {
  const [experiments, setExperiments] = useState(initialExperiments);
  const [statusFilter, setStatusFilter] = useState<ExperimentStatus | "all">(
    "all",
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedResults, setExpandedResults] = useState<ExperimentResult[]>([]);
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered =
    statusFilter === "all"
      ? experiments
      : experiments.filter((e) => e.status === statusFilter);

  const countByStatus = (status: ExperimentStatus) =>
    experiments.filter((e) => e.status === status).length;

  const handleTransition = useCallback(
    (experimentId: string, newStatus: ExperimentStatus) => {
      setError(null);
      startTransition(async () => {
        try {
          const updated = await updateExperimentStatusAction(
            experimentId,
            newStatus,
          );
          setExperiments((prev) =>
            prev.map((e) => (e.id === updated.id ? updated : e)),
          );
        } catch (e) {
          console.error("[experiment-tracker] transition failed:", e);
          setError("Failed to update experiment status. Please try again.");
        }
      });
    },
    [],
  );

  const handleExpand = useCallback(
    (experimentId: string) => {
      if (expandedId === experimentId) {
        setExpandedId(null);
        setExpandedResults([]);
        return;
      }
      setExpandedId(experimentId);
      setExpandedResults([]);
      startTransition(async () => {
        try {
          const results = await getExperimentResultsData(experimentId);
          // Guard: only update if this experiment is still expanded
          setExpandedId((current) => {
            if (current === experimentId) {
              setExpandedResults(results);
            }
            return current;
          });
        } catch (e) {
          console.error("[experiment-tracker] expand failed:", e);
          setError("Failed to load experiment results.");
        }
      });
    },
    [expandedId],
  );

  const handleCreate = useCallback(
    (formData: FormData) => {
      const title = formData.get("title") as string;
      const hypothesis = (formData.get("hypothesis") as string) || undefined;
      const strategy_section_ref =
        (formData.get("strategy_section_ref") as string) || undefined;
      const success_metric =
        (formData.get("success_metric") as string) || undefined;

      if (!title) return;

      setError(null);
      startTransition(async () => {
        try {
          const created = await createNewExperiment({
            title,
            hypothesis,
            strategy_section_ref,
            success_metric,
          });
          setExperiments((prev) => [created, ...prev]);
          setDialogOpen(false);
        } catch (e) {
          console.error("[experiment-tracker] create failed:", e);
          setError("Failed to create experiment. Please try again.");
        }
      });
    },
    [],
  );

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Header + filter + create */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
          >
            All ({experiments.length})
          </Button>
          {ALL_STATUSES.map((s) => {
            const { label } = STATUS_BADGE[s];
            const count = countByStatus(s);
            return (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(s)}
              >
                {label} ({count})
              </Button>
            );
          })}
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Experiment
          </DialogTrigger>
          <DialogContent>
            <form action={handleCreate}>
              <DialogHeader>
                <DialogTitle>New Experiment</DialogTitle>
                <DialogDescription>
                  Track a marketing experiment with a hypothesis and success
                  metric.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    name="title"
                    placeholder="e.g., LinkedIn content series"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="hypothesis">Hypothesis</Label>
                  <Textarea
                    id="hypothesis"
                    name="hypothesis"
                    placeholder="If we X, then Y because Z"
                    rows={2}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="strategy_section_ref">Channel</Label>
                  <Input
                    id="strategy_section_ref"
                    name="strategy_section_ref"
                    placeholder="e.g., Channels.ContentSEO"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="success_metric">Success Metric</Label>
                  <Input
                    id="success_metric"
                    name="success_metric"
                    placeholder="e.g., organic traffic > 500/week"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Creating..." : "Create Experiment"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Experiment table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No experiments {statusFilter !== "all" ? `with status "${statusFilter}"` : "yet"}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Title</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Success Metric</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((exp) => {
                  const badge = STATUS_BADGE[exp.status];
                  const isExpanded = expandedId === exp.id;
                  return (
                    <React.Fragment key={exp.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => handleExpand(exp.id)}
                      >
                        <TableCell>
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{exp.title}</div>
                          {exp.hypothesis && (
                            <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                              {exp.hypothesis}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {parseChannelName(exp.strategy_section_ref)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {exp.success_metric || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {exp.status === "backlog" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleTransition(exp.id, "running")
                                }
                                disabled={isPending}
                              >
                                <Play className="h-3 w-3 mr-1" />
                                Start
                              </Button>
                            )}
                            {exp.status === "running" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleTransition(exp.id, "completed")
                                }
                                disabled={isPending}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Complete
                              </Button>
                            )}
                            {exp.status === "completed" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleTransition(exp.id, "won")
                                  }
                                  disabled={isPending}
                                >
                                  <Trophy className="h-3 w-3 mr-1" />
                                  Won
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleTransition(exp.id, "lost")
                                  }
                                  disabled={isPending}
                                >
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Lost
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${exp.id}-detail`}>
                          <TableCell colSpan={6} className="bg-muted/50">
                            <div className="py-2 px-4 space-y-2">
                              {exp.description && (
                                <p className="text-sm">{exp.description}</p>
                              )}
                              <p className="text-xs text-muted-foreground font-medium">
                                Results History
                              </p>
                              {expandedResults.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  No results recorded yet
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {expandedResults.map((r) => (
                                    <div
                                      key={r.id}
                                      className="flex items-center justify-between text-xs border-b border-border/50 py-1"
                                    >
                                      <span className="text-muted-foreground">
                                        {r.week_start ||
                                          new Date(
                                            r.recorded_at,
                                          ).toLocaleDateString()}
                                      </span>
                                      <span className="font-medium">
                                        {r.metric_value != null
                                          ? r.metric_value
                                          : "—"}
                                      </span>
                                      {r.notes && (
                                        <span className="text-muted-foreground truncate max-w-[200px]">
                                          {r.notes}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
