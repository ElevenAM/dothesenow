"use client";

import { useState, useTransition, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, Loader2, X } from "lucide-react";
import { prepareUpload, finalizeUpload } from "@/lib/documents/actions";
import { ALLOWED_FILE_TYPE_LABEL } from "@dothesenow/queries";

interface DocumentUploadDialogProps {
  /** Link upload to a strategy doc, contact, campaign, or experiment */
  strategyDocId?: string | null;
  contactId?: string | null;
  campaignId?: string | null;
  experimentId?: string | null;
  /** Override button label (default: "Upload") */
  label?: string;
  /** Override button variant (default: "default") */
  variant?: "default" | "outline" | "ghost";
}

export function DocumentUploadDialog({
  strategyDocId,
  contactId,
  campaignId,
  experimentId,
  label = "Upload",
  variant = "default",
}: DocumentUploadDialogProps = {}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);

  const resetForm = useCallback(() => {
    setFile(null);
    setTitle("");
    setDescription("");
    setTags("");
    setError(null);
  }, []);

  function handleFileSelect(selected: File) {
    setFile(selected);
    if (!title) {
      setTitle(selected.name.replace(/\.[^.]+$/, ""));
    }
    setError(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  }

  function handleSubmit() {
    if (!file) return;
    setError(null);

    startTransition(async () => {
      try {
        // 1. Get signed upload URL
        const { signedUrl, path, documentId } = await prepareUpload(
          file.name,
          file.type,
          file.size,
        );

        // 2. Upload file directly to Storage
        const uploadRes = await fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload file");
        }

        // 3. Finalize: create the DB record
        await finalizeUpload({
          title: title || file.name,
          description: description || null,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          storage_path: path,
          tags: tags
            ? tags.split(",").map((t) => t.trim()).filter(Boolean)
            : [],
          strategy_doc_id: strategyDocId ?? null,
          contact_id: contactId ?? null,
          campaign_id: campaignId ?? null,
          experiment_id: experimentId ?? null,
        });

        resetForm();
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger render={<Button size="sm" variant={variant} />}>
        <Upload className="mr-1.5 h-4 w-4" />
        {label}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Context Doc</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!file ? (
            <div
              className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-8 transition-colors ${
                dragOver
                  ? "border-[var(--fgColor-accent)] bg-[var(--bgColor-muted)]"
                  : "border-[var(--borderColor-default)]"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileSelect(f);
                    }}
                  />
                </label>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {ALLOWED_FILE_TYPE_LABEL}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-md border border-[var(--borderColor-default)] p-3">
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setFile(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="doc-title">Title</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-desc">Description (optional)</Label>
            <Textarea
              id="doc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-tags">Tags (optional, comma-separated)</Label>
            <Input
              id="doc-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="proposal, q1, strategy"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!file || isPending}
            className="w-full"
          >
            {isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-4 w-4" />
            )}
            {isPending ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
