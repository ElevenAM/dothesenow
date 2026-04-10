"use client";

import { type ReactNode } from "react";
import { CreditsProvider } from "@/contexts/credits-context";

export function DashboardClientShell({
  initialCredits,
  children,
}: {
  initialCredits: number;
  children: ReactNode;
}) {
  return (
    <CreditsProvider initialCredits={initialCredits}>
      {children}
    </CreditsProvider>
  );
}
