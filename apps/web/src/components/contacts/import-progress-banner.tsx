"use client";

import { useState, useEffect, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, X } from "lucide-react";
import { getContactImport, cancelContactImport } from "@/lib/contacts/actions";
import type { ContactImport } from "@dothesenow/types";

interface ImportProgressBannerProps {
  importId: string;
  onDismiss: () => void;
}

export function ImportProgressBanner({ importId, onDismiss }: ImportProgressBannerProps) {
  const [importData, setImportData] = useState<ContactImport | null>(null);
  const [isCancelling, startCancelTransition] = useTransition();

  // Poll for import status while active
  useEffect(() => {
    let active = true;

    const poll = async () => {
      const data = await getContactImport(importId);
      if (!active) return;
      setImportData(data);

      // Keep polling if still in progress
      if (data && (data.status === "pending" || data.status === "processing")) {
        setTimeout(poll, 2000);
      }
    };

    poll();
    return () => { active = false; };
  }, [importId]);

  if (!importData) return null;

  const { status, imported_rows, total_rows, error_rows, skipped_rows } = importData;
  const totalProcessed = imported_rows + error_rows + skipped_rows;
  const progressPercent = total_rows && total_rows > 0
    ? Math.round((totalProcessed / total_rows) * 100)
    : 0;

  const isActive = status === "pending" || status === "processing";
  const isDone = status === "completed" || status === "partial" || status === "failed" || status === "cancelled";

  const handleCancel = () => {
    startCancelTransition(async () => {
      await cancelContactImport(importId);
    });
  };

  return (
    <div className="flex items-center gap-3 rounded-md border bg-muted/50 px-4 py-2.5">
      {/* Status icon */}
      {isActive && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--fgColor-accent)]" />}
      {status === "completed" && <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--fgColor-success)]" />}
      {status === "partial" && <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--fgColor-attention)]" />}
      {status === "failed" && <XCircle className="h-4 w-4 shrink-0 text-[var(--fgColor-danger)]" />}
      {status === "cancelled" && <X className="h-4 w-4 shrink-0 text-muted-foreground" />}

      {/* Status text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {isActive && "Importing contacts..."}
            {status === "completed" && "Import complete"}
            {status === "partial" && "Import completed with errors"}
            {status === "failed" && "Import failed"}
            {status === "cancelled" && "Import cancelled"}
          </span>
          <span className="text-xs text-muted-foreground">
            {importData.file_name}
          </span>
        </div>

        {/* Progress bar */}
        {isActive && total_rows && total_rows > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[var(--fgColor-accent)] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {totalProcessed}/{total_rows}
            </span>
          </div>
        )}

        {/* Result badges */}
        {isDone && (
          <div className="mt-1 flex gap-2">
            {imported_rows > 0 && (
              <Badge variant="secondary" className="text-xs">
                {imported_rows} imported
              </Badge>
            )}
            {error_rows > 0 && (
              <Badge variant="destructive" className="text-xs">
                {error_rows} errors
              </Badge>
            )}
            {skipped_rows > 0 && (
              <Badge variant="outline" className="text-xs">
                {skipped_rows} skipped
              </Badge>
            )}
          </div>
        )}

        {/* Error details (first 3) */}
        {isDone && importData.errors && importData.errors.length > 0 && (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Show error details ({importData.errors.length})
            </summary>
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
              {importData.errors.slice(0, 20).map((err, i) => (
                <li key={i}>
                  Row {err.row_number}: {err.field} — {err.reason}
                </li>
              ))}
              {importData.errors.length > 20 && (
                <li className="text-muted-foreground/70">
                  ...and {importData.errors.length - 20} more
                </li>
              )}
            </ul>
          </details>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 gap-1">
        {isActive && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={isCancelling}
          >
            {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Cancel"}
          </Button>
        )}
        {isDone && (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
