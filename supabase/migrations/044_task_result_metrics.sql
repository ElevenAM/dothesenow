-- Migration 044: Task Result Metrics
--
-- Adds result_metrics JSONB column to dtn_daily_tasks for structured
-- result reporting. When a user completes a task (e.g., "made 3 Reddit posts,
-- got 15/23/7 upvotes"), the metrics are stored here rather than as
-- freetext in outcome_notes.
--
-- Also adds an index for querying tasks with results, enabling
-- strategy feedback loops (e.g., "which approaches got the best metrics?").

ALTER TABLE dtn_daily_tasks ADD COLUMN result_metrics JSONB DEFAULT NULL;

-- Partial index: only rows that actually have metrics
CREATE INDEX idx_daily_tasks_result_metrics
  ON dtn_daily_tasks USING gin (result_metrics)
  WHERE result_metrics IS NOT NULL;

COMMENT ON COLUMN dtn_daily_tasks.result_metrics IS
  'Structured metrics from task execution (e.g., {"upvotes": 15, "comments": 3}). '
  'Populated via report_task_result MCP tool or chat interface.';
