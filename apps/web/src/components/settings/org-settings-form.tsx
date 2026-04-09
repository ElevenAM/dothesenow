"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { updateOrgSettings } from "@/lib/settings/actions";

const INDUSTRY_OPTIONS = [
  { value: "b2b_saas", label: "B2B SaaS" },
  { value: "dev_tools", label: "Developer Tools" },
  { value: "dtc_ecommerce", label: "DTC eCommerce" },
  { value: "fintech", label: "Fintech" },
  { value: "marketplace", label: "Marketplace" },
  { value: "healthtech", label: "Healthtech" },
  { value: "other", label: "Other" },
];

const BUDGET_OPTIONS = [
  { value: "bootstrap", label: "Bootstrap (<$1K/mo)" },
  { value: "growth", label: "Growth ($1K–$10K/mo)" },
  { value: "scale", label: "Scale ($10K+/mo)" },
];

const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HST)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Berlin", label: "Berlin (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
];

interface OrgSettingsFormProps {
  org: {
    name: string;
    slug: string;
    industry: string | null;
    budgetTier: string | null;
    timezone: string | null;
  };
}

export function OrgSettingsForm({ org }: OrgSettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(org.name);
  const [industry, setIndustry] = useState(org.industry ?? "");
  const [budgetTier, setBudgetTier] = useState(org.budgetTier ?? "");
  const [timezone, setTimezone] = useState(org.timezone ?? "America/New_York");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const hasChanges =
    name !== org.name ||
    industry !== (org.industry ?? "") ||
    budgetTier !== (org.budgetTier ?? "") ||
    timezone !== (org.timezone ?? "America/New_York");

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateOrgSettings({
        name: name.trim(),
        industry: industry || null,
        budget_tier: budgetTier || null,
        timezone,
      });
      if ("error" in result) {
        setError(result.error);
      } else {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orgName">Organization name</Label>
            <Input
              id="orgName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label>Slug</Label>
            <Input value={org.slug} disabled className="text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              URL slug cannot be changed after creation.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="industry">Industry</Label>
            <Select
              value={industry}
              onValueChange={(v) => v && setIndustry(v)}
              disabled={isPending}
            >
              <SelectTrigger id="industry">
                <SelectValue placeholder="Select industry" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget">Budget tier</Label>
            <Select
              value={budgetTier}
              onValueChange={(v) => v && setBudgetTier(v)}
              disabled={isPending}
            >
              <SelectTrigger id="budget">
                <SelectValue placeholder="Select budget tier" />
              </SelectTrigger>
              <SelectContent>
                {BUDGET_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              value={timezone}
              onValueChange={(v) => v && setTimezone(v)}
              disabled={isPending}
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="text-sm text-[var(--fgColor-danger)]">{error}</div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={!hasChanges || isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save changes
        </Button>
        {saved && (
          <span className="text-sm text-[var(--fgColor-success)]">Saved</span>
        )}
      </div>
    </div>
  );
}
