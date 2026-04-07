"use client";

import { Card } from "@/components/ui/card";
import { Industry } from "@dothesenow/types";
import {
  Building2,
  Code2,
  ShoppingBag,
  Landmark,
  Store,
  Heart,
  HelpCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface IndustrySelectorProps {
  value: Industry | null;
  onSelect: (industry: Industry) => void;
}

interface IndustryOption {
  value: Industry;
  label: string;
  icon: LucideIcon;
}

const INDUSTRIES: IndustryOption[] = [
  { value: Industry.B2bSaas, label: "B2B SaaS", icon: Building2 },
  { value: Industry.DevTools, label: "Developer Tools", icon: Code2 },
  { value: Industry.DtcEcommerce, label: "DTC eCommerce", icon: ShoppingBag },
  { value: Industry.Fintech, label: "Fintech", icon: Landmark },
  { value: Industry.Marketplace, label: "Marketplace", icon: Store },
  { value: Industry.Healthtech, label: "Healthtech", icon: Heart },
  { value: Industry.Other, label: "Other", icon: HelpCircle },
];

export function IndustrySelector({ value, onSelect }: IndustrySelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {INDUSTRIES.map(({ value: industryValue, label, icon: Icon }) => (
        <Card
          key={industryValue}
          className={`cursor-pointer p-4 transition-all hover:ring-2 hover:ring-primary/50 ${
            value === industryValue
              ? "ring-2 ring-primary bg-primary/5"
              : "hover:bg-muted/50"
          }`}
          onClick={() => onSelect(industryValue)}
          role="radio"
          aria-checked={value === industryValue}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(industryValue);
            }
          }}
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <Icon className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium">{label}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}
