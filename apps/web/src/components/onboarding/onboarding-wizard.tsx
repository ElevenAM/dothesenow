"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IndustrySelector } from "./industry-selector";
import { BudgetSelector } from "./budget-selector";
import {
  onboardingCreateOrg,
  onboardingSetProfile,
} from "@/lib/onboarding/actions";
import type { Industry, BudgetTier } from "@dothesenow/types";
import { Loader2, ArrowLeft } from "lucide-react";

interface OnboardingWizardProps {
  resumeAtStep?: number;
  existingSlug?: string;
}

const STEPS = [
  { number: 1, label: "Organization" },
  { number: 2, label: "Industry" },
  { number: 3, label: "Budget" },
];

export function OnboardingWizard({ resumeAtStep, existingSlug }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(resumeAtStep ?? 1);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState(existingSlug ?? "");
  const [industry, setIndustry] = useState<Industry | null>(null);
  const [budgetTier, setBudgetTier] = useState<BudgetTier | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const result = await onboardingCreateOrg(orgName);

    if ("error" in result) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    setOrgSlug(result.slug);
    setIsLoading(false);
    setStep(2);
  }

  function handleIndustrySelect(value: Industry) {
    setIndustry(value);
    setStep(3);
  }

  async function handleBudgetSelect(value: BudgetTier) {
    setBudgetTier(value);
    setIsLoading(true);
    setError("");

    const result = await onboardingSetProfile(industry!, value);

    if ("error" in result) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    router.push(`/${orgSlug || "marketing"}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <StepIndicator currentStep={step} />
          <CardTitle className="mt-4 text-2xl">
            {step === 1 && "Welcome to DoTheseNow"}
            {step === 2 && "What's your industry?"}
            {step === 3 && "What's your marketing budget?"}
          </CardTitle>
          <CardDescription>
            {step === 1 &&
              "Create your organization to get started."}
            {step === 2 &&
              "We'll tailor your strategy — you can refine anytime."}
            {step === 3 &&
              "This helps us recommend the right tactics for your stage."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 text-sm text-destructive">{error}</div>
          )}

          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization name</Label>
                <Input
                  id="orgName"
                  placeholder="Acme Marketing"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  minLength={2}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  This is your company or team name
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Continue
              </Button>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <IndustrySelector value={industry} onSelect={handleIndustrySelect} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(1)}
                className="mt-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <BudgetSelector value={budgetTier} onSelect={handleBudgetSelect} />
              {isLoading && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Setting up your workspace...
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBudgetTier(null);
                  setError("");
                  setStep(2);
                }}
                disabled={isLoading}
                className="mt-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <nav aria-label="Onboarding progress" className="flex items-center justify-center gap-2">
      {STEPS.map(({ number, label }) => (
        <div key={number} className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
              number === currentStep
                ? "bg-primary text-primary-foreground"
                : number < currentStep
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
            }`}
            aria-current={number === currentStep ? "step" : undefined}
            aria-label={`Step ${number}: ${label}`}
          >
            {number}
          </div>
          {number < STEPS.length && (
            <div
              className={`h-px w-8 ${
                number < currentStep ? "bg-primary/40" : "bg-muted"
              }`}
            />
          )}
        </div>
      ))}
    </nav>
  );
}
