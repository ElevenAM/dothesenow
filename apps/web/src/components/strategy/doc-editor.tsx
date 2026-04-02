"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateStrategyDoc } from "@/lib/strategy/actions";
import type { StrategyDoc } from "@/lib/strategy/actions";
import { Save, Loader2, ArrowLeft } from "lucide-react";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

interface DocEditorProps {
  doc: StrategyDoc;
  onBack: () => void;
}

export function DocEditor({ doc, onBack }: DocEditorProps) {
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const [changeSummary, setChangeSummary] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Reset state when doc changes (e.g. viewing a different version)
  useEffect(() => {
    setTitle(doc.title);
    setContent(doc.content);
    setChangeSummary("");
    setIsDirty(false);
    setError(null);
    setSaved(false);
  }, [doc.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Track dirty state
  useEffect(() => {
    const dirty = title !== doc.title || content !== doc.content;
    setIsDirty(dirty);
  }, [title, content, doc.title, doc.content]);

  // Warn on navigation with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleSave = useCallback(() => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateStrategyDoc(
          doc.id,
          title,
          content,
          changeSummary || "Updated from web editor",
          doc.tags,
        );
        setIsDirty(false);
        setSaved(true);
        setChangeSummary("");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }, [doc.id, doc.tags, title, content, changeSummary]);

  // Ctrl+S / Cmd+S shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty && !isPending) handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDirty, isPending, handleSave]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-lg font-semibold border-0 px-0 focus-visible:ring-0"
            placeholder="Document title"
          />
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          )}
          {saved && (
            <span className="text-xs text-green-600">Saved</span>
          )}
          <Button onClick={handleSave} disabled={!isDirty || isPending} size="sm">
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label htmlFor="change-summary" className="text-xs text-muted-foreground">
            Change summary (optional)
          </Label>
          <Input
            id="change-summary"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            placeholder="Describe what changed..."
            className="text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div data-color-mode="light" className="min-h-[500px]">
        <MDEditor
          value={content}
          onChange={(val) => setContent(val ?? "")}
          height={500}
          preview="live"
        />
      </div>
    </div>
  );
}
