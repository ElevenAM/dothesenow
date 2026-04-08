"use client";

import { useState, useTransition } from "react";
import { updateSpecialties } from "@/lib/team/actions";

const SPECIALTIES = [
  { value: "content_writer", label: "Content Writer" },
  { value: "social_media", label: "Social Media" },
  { value: "analytics", label: "Analytics" },
  { value: "design", label: "Design" },
  { value: "growth_lead", label: "Growth Lead" },
  { value: "seo", label: "SEO" },
  { value: "email_marketing", label: "Email Marketing" },
  { value: "paid_ads", label: "Paid Ads" },
  { value: "community", label: "Community" },
] as const;

export function SpecialtyPicker({
  membershipId,
  current,
}: {
  membershipId: string;
  current: string[];
}) {
  const [selected, setSelected] = useState<string[]>(current);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(value: string) {
    setError(null);
    const next = selected.includes(value)
      ? selected.filter((s) => s !== value)
      : [...selected, value];

    setSelected(next);
    startTransition(async () => {
      const result = await updateSpecialties(membershipId, next);
      if ("error" in result) {
        setError(result.error);
        setSelected(selected); // revert on failure
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {SPECIALTIES.map((spec) => {
          const isActive = selected.includes(spec.value);
          return (
            <button
              key={spec.value}
              type="button"
              onClick={() => toggle(spec.value)}
              disabled={isPending}
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer border ${
                isActive
                  ? "bg-[var(--bgColor-accent-muted,#ddf4ff)] text-[var(--fgColor-accent,#0969da)] border-[var(--borderColor-accent-muted,#54aeff66)]"
                  : "bg-transparent text-[var(--fgColor-muted,#59636e)] border-[var(--borderColor-default,#d1d9e0)] hover:bg-[var(--bgColor-muted,#f6f8fa)]"
              } disabled:opacity-50`}
            >
              {spec.label}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="text-xs text-[var(--fgColor-danger,#d1242f)]">{error}</p>
      )}
    </div>
  );
}
