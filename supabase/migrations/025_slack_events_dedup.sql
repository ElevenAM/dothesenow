---
--- Phase [8A] — Slack Integration: Event Deduplication
---
--- Slack retries event delivery if it doesn't receive a 200 within 3 seconds.
--- This table deduplicates events using Slack's event_id as the primary key.
--- Service-role only — webhook handlers use admin client.
---

CREATE TABLE IF NOT EXISTS dtn_slack_events (
  event_id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'done', 'failed')),
  received_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_slack_events_received ON dtn_slack_events(received_at);

ALTER TABLE dtn_slack_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on slack_events"
  ON dtn_slack_events FOR ALL
  USING (auth.role() = 'service_role');
