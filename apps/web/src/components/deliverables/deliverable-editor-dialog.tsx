"use client";

import { useState, useTransition, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPost, updatePost } from "@/lib/blog/actions";
import type { BlogPost } from "@/lib/blog/actions";
import { Loader2, LinkIcon } from "lucide-react";

interface DeliverableEditorDialogProps {
  open: boolean;
  onClose: () => void;
  post: BlogPost | null;
  dept: string;
}

export function DeliverableEditorDialog({
  open,
  onClose,
  post,
  dept,
}: DeliverableEditorDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [status, setStatus] = useState("draft");
  const [author, setAuthor] = useState("");
  const [tags, setTags] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");

  useEffect(() => {
    if (post) {
      setTitle(post.title);
      setContent(post.content);
      setExcerpt(post.excerpt ?? "");
      setStatus(post.status);
      setAuthor(post.author ?? "");
      setTags(post.tags?.join(", ") ?? "");
      setSeoTitle(post.seo_title ?? "");
      setSeoDescription(post.seo_description ?? "");
    } else {
      setTitle("");
      setContent("");
      setExcerpt("");
      setStatus("draft");
      setAuthor("");
      setTags("");
      setSeoTitle("");
      setSeoDescription("");
    }
    setError(null);
  }, [post, open]);

  function handleSave() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!content.trim()) {
      setError("Content is required.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const parsedTags = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      if (post) {
        const result = await updatePost(dept, post.id, {
          title: title.trim(),
          content,
          excerpt: excerpt || null,
          status,
          author: author || null,
          tags: parsedTags,
          seo_title: seoTitle || null,
          seo_description: seoDescription || null,
        });
        if ("error" in result) {
          setError(result.error);
          return;
        }
      } else {
        const slug = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

        const result = await createPost(dept, {
          title: title.trim(),
          slug,
          content,
          excerpt: excerpt || null,
          status,
          author: author || null,
          tags: parsedTags,
          seo_title: seoTitle || null,
          seo_description: seoDescription || null,
        });
        if ("error" in result) {
          setError(result.error);
          return;
        }
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {post ? "Edit Deliverable" : "New Deliverable"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Source task (read-only) */}
          {post?.task && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] px-3 py-2 text-sm">
              <LinkIcon className="h-3.5 w-3.5 text-[var(--fgColor-muted)]" />
              <span className="text-[var(--fgColor-muted)]">Source task:</span>
              <span className="font-medium">{post.task.title}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Deliverable title"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content (Markdown)</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your content in markdown..."
              rows={12}
              className="font-mono text-sm"
              disabled={isPending}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="excerpt">Excerpt</Label>
              <Input
                id="excerpt"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder="Brief summary"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="author">Author</Label>
              <Input
                id="author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Author name"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v)} disabled={isPending}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="tag1, tag2, tag3"
                disabled={isPending}
              />
            </div>
          </div>

          <details className="rounded-md border border-[var(--borderColor-default)] p-3">
            <summary className="cursor-pointer text-sm font-medium">
              SEO Settings
            </summary>
            <div className="mt-3 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="seoTitle">SEO Title</Label>
                <Input
                  id="seoTitle"
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  placeholder="Custom SEO title (defaults to deliverable title)"
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="seoDesc">SEO Description</Label>
                <Textarea
                  id="seoDesc"
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  placeholder="Meta description for search engines"
                  rows={2}
                  disabled={isPending}
                />
              </div>
            </div>
          </details>

          {error && (
            <div className="text-sm text-[var(--fgColor-danger)]">{error}</div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {post ? "Save Changes" : "Create Deliverable"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
