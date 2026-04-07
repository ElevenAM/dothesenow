-- Phase 4B follow-up: Fix race condition, add RLS policies, add index, add status to stripe events
--
-- Credit Ledger State Machine:
--   reserved  ──confirm──▶ confirmed  (final)
--   reserved  ──refund───▶ refunded   (final, balance restored)
--   confirmed ──(none)───  (terminal — cannot transition)
--   refunded  ──(none)───  (terminal — cannot transition)

BEGIN;

-- ─── 1. Fix refund_credits race condition ────────────────────────
-- The original refund_credits locks the ledger entry but not the org row.
-- Concurrent refunds on the same org could interleave balance updates.
-- Fix: lock the org row with FOR UPDATE before updating balance.

CREATE OR REPLACE FUNCTION refund_credits(
  p_ledger_id UUID
) RETURNS VOID AS $$
DECLARE
  v_entry RECORD;
  v_current_balance INT;
BEGIN
  SELECT * INTO v_entry FROM dtn_credit_ledger WHERE id = p_ledger_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ledger entry not found: %', p_ledger_id;
  END IF;

  -- Idempotent: already refunded is fine
  IF v_entry.status = 'refunded' THEN
    RETURN;
  END IF;

  IF v_entry.status = 'confirmed' THEN
    RAISE EXCEPTION 'Cannot refund a confirmed ledger entry: %', p_ledger_id;
  END IF;

  -- Lock the org row to prevent concurrent balance modifications
  SELECT ai_credits_remaining INTO v_current_balance
  FROM dtn_organizations WHERE id = v_entry.org_id FOR UPDATE;

  -- Restore balance (amount is negative for debits, so subtract it to add back)
  UPDATE dtn_organizations
  SET ai_credits_remaining = CASE
    WHEN v_current_balance = -1 THEN -1  -- unlimited stays unlimited
    ELSE v_current_balance + ABS(v_entry.amount)
  END
  WHERE id = v_entry.org_id;

  UPDATE dtn_credit_ledger
  SET status = 'refunded'
  WHERE id = p_ledger_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── 2. Explicit RLS deny policies for writes ───────────────────
-- Prevent authenticated users from directly inserting/updating/deleting ledger entries.
-- All writes go through SECURITY DEFINER RPCs.

CREATE POLICY "No direct ledger inserts"
  ON dtn_credit_ledger FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "No direct ledger updates"
  ON dtn_credit_ledger FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "No direct ledger deletes"
  ON dtn_credit_ledger FOR DELETE
  TO authenticated
  USING (false);


-- ─── 3. Add composite index for credit history pagination ───────
-- Optimizes getCreditHistory query: WHERE org_id = ? ORDER BY created_at DESC

CREATE INDEX IF NOT EXISTS idx_credit_ledger_org_created
  ON dtn_credit_ledger(org_id, created_at DESC);


-- ─── 4. Add status column to stripe events for retry support ────
-- Supports the new processing/done/failed lifecycle in the webhook handler.

ALTER TABLE dtn_stripe_events
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'done'
  CHECK (status IN ('processing', 'done', 'failed'));


-- ─── 5. Make ai_credits columns idempotent ──────────────────────
-- If migration 017 is re-run, ADD COLUMN without IF NOT EXISTS would fail.
-- This is a no-op if columns already exist (which they do), but documents intent.
-- Nothing to do here since the columns already exist from 017.

COMMIT;
