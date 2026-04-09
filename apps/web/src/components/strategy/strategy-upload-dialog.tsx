"use client";

import { useState, useTransition, useCallback } from "react";
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
import { Upload, Loader2, X } from "lucide-react";

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB
const ACCEPTED_EXTENSIONS = ".md,.txt,.markdown";

interface StrategyUploadDialogProps {
  existingTypes: string[];
  label?: string;
  variant?: "default" | "outline" | "ghost";
}

export function StrategyUploadDialog({
  existingTypes,
  label = "Upload",
  variant = "default",
}: StrategyUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<DocType | "">("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);

  const availableTypes = Object.entries(DOC_TYPE_LABELS).filter(
    ([key]) => !existingTypes.includes(key),
  );

  const resetForm = useCallback(() => {
    setFile(null);
    setFileContent(null);
    setTitle("");
    setDocType("");
    setError(null);
  }, []);

  function readFile(selected: File) {
    if (selected.size > MAX_FILE_SIZE) {
      setError("File too large. Maximum size is 1 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFileContent(reader.result as string);
      setFile(selected);
      if (!title) {
        setTitle(selected.name.replace(/\.[^.]+$/, ""));
      }
      setError(null);
    };
    reader.onerror = () => {
      setError("Failed to read file.");
    };
    reader.readAsText(selected);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) readFile(dropped);
  }

  function handleSubmit() {
    if (!file || !fileContent || !docType) return;
    setError(null);

    startTransition(async () => {
      try {
        await createStrategyDoc(
          docType as DocType,
          title || file.name,
          fileContent,
        );
        resetForm();
        setOpen(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create document",
        );
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger render={<Button size="sm" variant={variant} />}>
        <Upload className="h-4 w-4" />
        {label}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Strategy Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!file ? (
            <div
              className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-8 transition-colors ${
                dragOver
                  ? "border-[var(--fgColor-accent)] bg-[var(--bgColor-muted)]"
                  : "border-[var(--borderColor-default)]"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag and drop or{" "}
                <label className="cursor-pointer text-[var(--fgColor-accent)] hover:underline">
                  browse
                  <input
                    type="file"
                    className="hidden"
                    accept={ACCEPTED_EXTENSIONS}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) readFile(f);
                    }}
                  />
                </label>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Markdown (.md) or plain text (.txt), max 1 MB
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-md border border-[var(--borderColor-default)] p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setFile(null);
                  setFileContent(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="upload-doc-type">Document Type</Label>
            <Select
              value={docType}
              onValueChange={(val) => setDocType(val as DocType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {availableTypes.map(([value, labelText]) => (
                  <SelectItem key={value} value={value}>
                    {labelText}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="upload-doc-title">Title</Label>
            <Input
              id="upload-doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--fgColor-danger)]">{error}</p>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            onClick={handleSubmit}
            disabled={!file || !fileContent || !docType || isPending}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
