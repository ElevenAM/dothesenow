"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { ErrorFallback } from "@/components/ui/error-boundary";

export default function DeptError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return <ErrorFallback error={error} reset={reset} />;
}
