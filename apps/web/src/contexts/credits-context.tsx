"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { fetchCreditBalance } from "@/lib/credits/actions";

interface CreditsContextValue {
  credits: number;
  decrementCredits: (n?: number) => void;
  refreshCredits: () => Promise<void>;
}

const CreditsContext = createContext<CreditsContextValue | null>(null);

export function CreditsProvider({
  initialCredits,
  children,
}: {
  initialCredits: number;
  children: ReactNode;
}) {
  const [credits, setCredits] = useState(initialCredits);

  const decrementCredits = useCallback((n = 1) => {
    setCredits((c) => Math.max(0, c - n));
  }, []);

  const refreshCredits = useCallback(async () => {
    try {
      const balance = await fetchCreditBalance();
      setCredits(balance);
    } catch {
      // Silently fail — stale credit count is acceptable
    }
  }, []);

  return (
    <CreditsContext.Provider
      value={{ credits, decrementCredits, refreshCredits }}
    >
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits(): CreditsContextValue {
  const ctx = useContext(CreditsContext);
  if (!ctx) {
    throw new Error("useCredits must be used within a CreditsProvider");
  }
  return ctx;
}
