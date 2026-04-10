"use client";

import { useState, useTransition } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Download,
  Trash2,
  Save,
  Loader2,
  ExternalLink,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import {
  updateDocumentMetadata,
  removeDocument,
  getDownloadUrl,
} from "@/lib/documents/actions";
import type { Document } from "@dothesenow/types";

interface DocumentDetailSheetProps {
  document: Document;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentDetailSheet({
  document,
  open,
  onOpenChange,
}: DocumentDetailSheetProps) {
  const [title, setTitle] = useState(document.title);
  const [description, setDescription] = useState(document.description ?? "");
  const [tagsInput, setTagsInput] = useState(document.tags.join(", "));
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    title !== document.title ||
    description !== (document.description ?? "") ||
    tagsInput !== document.tags.join(", ");

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateDocumentMetadata(document.id, {
          title,
          description: description || null,
          tags: tagsInput
            ? tagsInput.split(",").map((t) => t.trim()).filter(Boolean)
            : [],
        });
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  function handleDelete() {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    setIsDeleting(true);
    startTransition(async () => {
      try {
        await removeDocument(document.id);
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
        setIsDeleting(false);
      }
    });
  }

  function handleDownload() {
    startTransition(async () => {
      try {
        const url = await getDownloadUrl(document.id);
        window.open(url, "_blank");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Download failed");
      }
    });
  }

  const isImage = document.file_type.startsWith("image/");
  const isPdf = document.file_type === "application/pdf";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {isImage ? (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            ) : (
              <FileText className="h-5 w-5 text-muted-foreground" />
            )}
            Context Doc Details
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Preview area */}
          {(isImage || isPdf) && (
            <div className="rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] p-2">
              {isPdf && (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  PDF preview available after download
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-2"
                    onClick={handleDownload}
                    disabled={isPending}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* File info */}
          <div className="flex items-center gap-3 text-sm">
            <Badge variant="outline">{document.file_type.split("/").pop()}</Badge>
            <span className="text-muted-foreground">{formatSize(document.file_size)}</span>
            <span className="text-muted-foreground">
              {new Date(document.created_at).toLocaleDateString()}
            </span>
          </div>

          <Separator />

          {/* Editable fields */}
          <div className="space-y-2">
            <Label htmlFor="detail-title">Title</Label>
            <Input
              id="detail-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="detail-desc">Description</Label>
            <Textarea
              id="detail-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="detail-tags">Tags (comma-separated)</Label>
            <Input
              id="detail-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={!isDirty || isPending}
              size="sm"
            >
              {isPending && !isDeleting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={isPending}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Download
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={isPending}
              className="text-destructive hover:text-destructive"
            >
              {isDeleting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" />
              )}
              Delete
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
