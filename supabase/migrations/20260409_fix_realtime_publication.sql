-- Fix: Add all tables with Realtime subscriptions to the publication.
-- Migration 005 set REPLICA IDENTITY FULL on these tables but several
-- ALTER PUBLICATION statements were never applied to production.
-- The RealtimeListener component subscribes to these tables for live updates.

DO $$
BEGIN
  -- Only add if not already present (idempotent)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mktg_strategy_docs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mktg_strategy_docs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'dtn_daily_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dtn_daily_tasks;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'dtn_experiments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dtn_experiments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mktg_contacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mktg_contacts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mktg_outreach_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mktg_outreach_log;
  END IF;
END $$;
