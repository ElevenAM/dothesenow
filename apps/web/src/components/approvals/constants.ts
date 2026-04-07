export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-[var(--label-yellow-bg)] text-[var(--label-yellow-fg)]",
  approved: "bg-[var(--label-green-bg)] text-[var(--label-green-fg)]",
  rejected: "bg-[var(--label-red-bg)] text-[var(--label-red-fg)]",
  revision_requested: "bg-[var(--label-orange-bg)] text-[var(--label-orange-fg)]",
};

export const ITEM_TYPE_LABELS: Record<string, string> = {
  social_post: "Social Post",
  blog_post: "Blog Post",
  email_draft: "Email Draft",
  task_submission: "Task Output",
  strategy_change: "Strategy Change",
};
