"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExecutorMetadata } from "@dothesenow/types";
import { connectIntegration } from "@/lib/integrations/actions";

interface ApiKeyFormProps {
  executor: ExecutorMetadata;
  onClose: () => void;
}

export function ApiKeyForm({ executor, onClose }: ApiKeyFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate required fields
    for (const field of executor.configSchema) {
      if (field.required && !values[field.key]?.trim()) {
        setError(`${field.label} is required`);
        return;
      }
    }

    startTransition(async () => {
      try {
        await connectIntegration(executor.type, values);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connection failed");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border p-3">
      {executor.configSchema.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label htmlFor={`field-${field.key}`}>
            {field.label}
            {!field.required && (
              <span className="ml-1 text-xs text-[var(--fgColor-muted)]">
                (optional)
              </span>
            )}
          </Label>
          <Input
            id={`field-${field.key}`}
            type={field.type === "secret" ? "password" : "text"}
            placeholder={field.placeholder}
            value={values[field.key] ?? ""}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
            }
            required={field.required}
          />
        </div>
      ))}

      {error && (
        <p className="text-xs text-[var(--fgColor-danger)]">{error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Connecting..." : "Connect"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
