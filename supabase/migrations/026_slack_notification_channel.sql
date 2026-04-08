-- Phase 8B: Slack cron functions support
-- Adds notification channel for EOD summaries and Slack origin tracking for bidirectional thread sync.

-- 1. EOD summary target channel
ALTER TABLE dtn_slack_installations
  ADD COLUMN notification_channel_id TEXT DEFAULT NULL;

COMMENT ON COLUMN dtn_slack_installations.notification_channel_id IS
  'Slack channel ID where EOD summaries are posted. NULL = skip EOD for this org.';

-- 2. Slack origin for bidirectional thread sync
ALTER TABLE dtn_daily_tasks
  ADD COLUMN slack_origin JSONB DEFAULT NULL;

ALTER TABLE dtn_daily_tasks
  ADD CONSTRAINT chk_slack_origin_shape CHECK (
    slack_origin IS NULL OR (
      slack_origin ? 'team_id' AND
      slack_origin ? 'channel_id' AND
      slack_origin ? 'message_ts'
    )
  );

COMMENT ON COLUMN dtn_daily_tasks.slack_origin IS
  'When created from Slack: { team_id, channel_id, message_ts } for bidirectional sync.';
