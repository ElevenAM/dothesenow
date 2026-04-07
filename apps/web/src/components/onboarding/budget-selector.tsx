"use client";

import { Card } from "@/components/ui/card";
import { BudgetTier } from "@dothesenow/types";

interface BudgetSelectorProps {
  value: BudgetTier | null;
  onSelect: (tier: BudgetTier) => void;
}

interface BudgetOption {
  value: BudgetTier;
  label: string;
  description: string;
}

const BUDGET_TIERS: BudgetOption[] = [
  {
    value: BudgetTier.Bootstrap,
    label: "Bootstrap",
    description: "<$1K/mo — Bootstrapped, organic-first",
  },
  {
    value: BudgetTier.Growth,
    label: "Growth",
    description: "$1K–$10K/mo — Ready to invest in growth",
  },
  {
    value: BudgetTier.Scale,
    label: "Scale",
    description: "$10K+/mo — Scaling proven channels",
  },
];

export function BudgetSelector({ value, onSelect }: BudgetSelectorProps) {
  return (
    <div className="flex flex-col gap-3">
      {BUDGET_TIERS.map(({ value: tierValue, label, description }) => (
        <Card
          key={tierValue}
          className={`cursor-pointer p-4 transition-all hover:ring-2 hover:ring-primary/50 ${
            value === tierValue
              ? "ring-2 ring-primary bg-primary/5"
              : "hover:bg-muted/50"
          }`}
          onClick={() => onSelect(tierValue)}
          role="radio"
          aria-checked={value === tierValue}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(tierValue);
            }
          }}
        >
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">{label}</span>
            <span className="text-xs text-muted-foreground">{description}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}
