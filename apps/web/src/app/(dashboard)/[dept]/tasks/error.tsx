"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function TasksError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Tasks page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <AlertTriangle className="h-10 w-10 text-[var(--fgColor-attention)]" />
      <h2 className="text-lg font-semibold">
        Something went wrong loading tasks
      </h2>
      <p className="text-sm text-[var(--fgColor-muted)] max-w-md text-center">
        {error.message || "An unexpected error occurred. Please try again."}
      </p>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  );
}
