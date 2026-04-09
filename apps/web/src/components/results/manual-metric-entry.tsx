"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { logManualMetric } from "@/lib/results/actions";

const METRIC_TYPES = [
  { value: "traffic", label: "Traffic" },
  { value: "conversion", label: "Conversion" },
  { value: "engagement", label: "Engagement" },
  { value: "revenue", label: "Revenue" },
  { value: "other", label: "Other" },
];

export function ManualMetricEntry() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [metricName, setMetricName] = useState("");
  const [metricValue, setMetricValue] = useState("");
  const [metricType, setMetricType] = useState("traffic");
  const [periodStart, setPeriodStart] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [periodEnd, setPeriodEnd] = useState(
    new Date().toISOString().split("T")[0],
  );

  const reset = () => {
    setMetricName("");
    setMetricValue("");
    setMetricType("traffic");
    setPeriodStart(new Date().toISOString().split("T")[0]);
    setPeriodEnd(new Date().toISOString().split("T")[0]);
    setError(null);
  };

  const handleSubmit = () => {
    if (!metricName.trim()) return;
    const numValue = parseFloat(metricValue);
    if (isNaN(numValue)) {
      setError("Metric value must be a number");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await logManualMetric({
          metric_name: metricName.trim(),
          metric_value: numValue,
          metric_type: metricType,
          period_start: periodStart,
          period_end: periodEnd,
        });
        reset();
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to log metric");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="h-4 w-4" />
        Log Metric
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Manual Metric</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="metric-name">Metric Name *</Label>
            <Input
              id="metric-name"
              value={metricName}
              onChange={(e) => setMetricName(e.target.value)}
              placeholder="e.g. monthly_revenue, signups, page_views"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="metric-value">Value *</Label>
              <Input
                id="metric-value"
                type="number"
                step="any"
                value={metricValue}
                onChange={(e) => setMetricValue(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={metricType} onValueChange={(v) => v && setMetricType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="period-start">Period Start</Label>
              <Input
                id="period-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="period-end">Period End</Label>
              <Input
                id="period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            onClick={handleSubmit}
            disabled={!metricName.trim() || !metricValue || isPending}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Log Metric
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
