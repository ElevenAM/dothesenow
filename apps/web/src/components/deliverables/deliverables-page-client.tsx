"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { DeliverableEditorDialog } from "./deliverable-editor-dialog";
import { DeliverablePreviewSheet } from "./deliverable-preview-sheet";
import { deletePost, publishPost } from "@/lib/blog/actions";
import type { BlogPost } from "@/lib/blog/actions";
import {
  PackageCheck,
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Send,
  Pencil,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-[var(--label-gray-bg)] text-[var(--label-gray-fg)]",
  review: "bg-[var(--label-yellow-bg)] text-[var(--label-yellow-fg)]",
  approved: "bg-[var(--label-blue-bg)] text-[var(--label-blue-fg)]",
  published: "bg-[var(--label-green-bg)] text-[var(--label-green-fg)]",
  archived: "bg-[var(--label-gray-bg)] text-[var(--label-gray-fg)]",
};

const APPROVED_STATUSES = new Set(["approved", "published"]);

interface DeliverablesPageClientProps {
  deliverables: BlogPost[];
  dept: string;
}

export function DeliverablesPageClient({
  deliverables,
  dept,
}: DeliverablesPageClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [previewPost, setPreviewPost] = useState<BlogPost | null>(null);

  const filtered = deliverables.filter((deliverable) => {
    const matchesSearch =
      !search || deliverable.title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || deliverable.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pending = filtered.filter((deliverable) => !APPROVED_STATUSES.has(deliverable.status) && deliverable.status !== "archived");
  const approved = filtered.filter((deliverable) => APPROVED_STATUSES.has(deliverable.status));
  const archived = filtered.filter((deliverable) => deliverable.status === "archived");

  function handleEdit(post: BlogPost) {
    setPreviewPost(null);
    setEditingPost(post);
    setEditorOpen(true);
  }

  function handleCreate() {
    setEditingPost(null);
    setEditorOpen(true);
  }

  function handleDelete(postId: string) {
    startTransition(async () => {
      await deletePost(dept, postId);
      router.refresh();
    });
  }

  function handlePublish(postId: string) {
    startTransition(async () => {
      await publishPost(dept, postId);
      router.refresh();
    });
  }

  function handleEditorClose() {
    setEditorOpen(false);
    setEditingPost(null);
    router.refresh();
  }

  function renderTable(items: BlogPost[]) {
    return (
      <div className="rounded-md border border-[var(--borderColor-default)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--borderColor-default)] bg-[var(--bgColor-muted)]">
              <th className="px-4 py-2.5 text-left font-medium text-[var(--fgColor-muted)]">
                Title
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--fgColor-muted)]">
                Status
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--fgColor-muted)]">
                Source Task
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--fgColor-muted)]">
                Updated
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {items.map((post) => (
              <tr
                key={post.id}
                className="border-b border-[var(--borderColor-default)] last:border-0 hover:bg-[var(--bgColor-muted)] transition-colors"
              >
                <td className="px-4 py-3">
                  <button
                    onClick={() => setPreviewPost(post)}
                    className="font-medium text-left hover:text-[var(--fgColor-accent)] transition-colors"
                  >
                    {post.title}
                  </button>
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {post.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs text-[var(--fgColor-muted)]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant="secondary"
                    className={STATUS_COLORS[post.status] ?? ""}
                  >
                    {post.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-[var(--fgColor-muted)]">
                  {post.task?.title ?? "—"}
                </td>
                <td className="px-4 py-3 text-[var(--fgColor-muted)]">
                  {new Date(post.updated_at).toLocaleDateString()}
                </td>
                <td className="px-2 py-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="sm" className="h-8 w-8 p-0" />}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(post)}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      {post.status !== "published" && (
                        <DropdownMenuItem
                          onClick={() => handlePublish(post.id)}
                          disabled={isPending}
                        >
                          <Send className="h-4 w-4" />
                          Publish
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => handleDelete(post.id)}
                        className="text-[var(--fgColor-danger)]"
                        disabled={isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search deliverables..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-60"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="review">Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="h-3.5 w-3.5" />
          New Deliverable
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="No deliverables yet"
          description="Deliverables from completed tasks will appear here."
          actionLabel="New Deliverable"
          onAction={handleCreate}
        />
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-[var(--fgColor-muted)]">
                Pending Review ({pending.length})
              </h2>
              {renderTable(pending)}
            </div>
          )}
          {approved.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-[var(--fgColor-muted)]">
                Approved ({approved.length})
              </h2>
              {renderTable(approved)}
            </div>
          )}
          {archived.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-[var(--fgColor-muted)]">
                Archived ({archived.length})
              </h2>
              {renderTable(archived)}
            </div>
          )}
        </div>
      )}

      <DeliverablePreviewSheet
        deliverable={previewPost}
        open={!!previewPost}
        onOpenChange={(open) => !open && setPreviewPost(null)}
        onEdit={handleEdit}
      />

      <DeliverableEditorDialog
        open={editorOpen}
        onClose={handleEditorClose}
        post={editingPost}
        dept={dept}
      />
    </div>
  );
}
