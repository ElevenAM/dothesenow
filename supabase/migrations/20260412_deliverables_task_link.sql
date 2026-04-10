-- Link deliverables (blog_posts) to the task that produced them
ALTER TABLE dtn_blog_posts
  ADD COLUMN task_id UUID REFERENCES dtn_daily_tasks(id) ON DELETE SET NULL;

CREATE INDEX idx_dtn_blog_posts_task
  ON dtn_blog_posts(task_id)
  WHERE task_id IS NOT NULL;
