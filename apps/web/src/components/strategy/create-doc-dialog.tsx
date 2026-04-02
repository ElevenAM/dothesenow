"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { createStrategyDoc } from "@/lib/strategy/actions";
import type { DocType } from "@/lib/strategy/actions";
import { DOC_TYPE_LABELS } from "@/lib/strategy/constants";
import { Plus, Loader2 } from "lucide-react";

interface CreateDocDialogProps {
  existingTypes: string[];
}

export function CreateDocDialog({ existingTypes }: CreateDocDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<DocType | "">("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const availableTypes = Object.entries(DOC_TYPE_LABELS).filter(
    ([key]) => !existingTypes.includes(key),
  );

  const handleCreate = () => {
    if (!title.trim() || !docType) return;
    setError(null);
    startTransition(async () => {
      try {
        await createStrategyDoc(docType as DocType, title.trim(), "");
        setOpen(false);
        setTitle("");
        setDocType("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create document");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="h-4 w-4" />
        New Document
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Strategy Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="doc-type">Document Type</Label>
            <Select value={docType} onValueChange={(val) => setDocType(val as DocType)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {availableTypes.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-title">Title</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Q2 2026 Marketing Strategy"
            />
          </div>
          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleCreate} disabled={!title.trim() || !docType || isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
