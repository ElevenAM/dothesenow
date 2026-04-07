-- Phase 6A: Add generation metadata to strategy docs for LLM-generated strategies
BEGIN;

ALTER TABLE mktg_strategy_docs
  ADD COLUMN IF NOT EXISTS generation_metadata JSONB DEFAULT NULL;

COMMENT ON COLUMN mktg_strategy_docs.generation_metadata IS
  'LLM generation metadata: model, tokens, frameworks, duration, status, validation errors. NULL for manually created docs.';

-- Functional index for filtering by generation status (used by Realtime subscriptions)
CREATE INDEX IF NOT EXISTS idx_strategy_docs_generation_status
  ON mktg_strategy_docs ((generation_metadata->>'status'))
  WHERE generation_metadata IS NOT NULL;

COMMIT;
