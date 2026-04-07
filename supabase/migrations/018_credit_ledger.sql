-- Phase 4B: Credit ledger table + atomic reserve/confirm/refund RPCs

BEGIN;

-- 1. Credit ledger table
CREATE TABLE dtn_credit_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES dtn_organizations(id),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('reserved', 'confirmed', 'refunded')),
  reference_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_credit_ledger_org ON dtn_credit_ledger(org_id);
CREATE INDEX idx_credit_ledger_status ON dtn_credit_ledger(org_id, status);
CREATE INDEX idx_credit_ledger_ref ON dtn_credit_ledger(reference_id) WHERE reference_id IS NOT NULL;

-- 2. RLS policies
ALTER TABLE dtn_credit_ledger ENABLE ROW LEVEL SECURITY;

-- Org members can read their own ledger entries
CREATE POLICY "Members can view own org credit ledger"
  ON dtn_credit_ledger FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM dtn_memberships
      WHERE dtn_memberships.org_id = dtn_credit_ledger.org_id
        AND dtn_memberships.user_id = auth.uid()
        AND dtn_memberships.is_active = true
    )
  );

-- Only service role can insert/update (via RPCs with SECURITY DEFINER)
-- No INSERT/UPDATE/DELETE policies for authenticated role

-- 3. updated_at trigger
CREATE TRIGGER set_credit_ledger_updated_at
  BEFORE UPDATE ON dtn_credit_ledger
  FOR EACH ROW
  EXECUTE FUNCTION mktg_update_timestamp();

-- 4. Atomic credit reservation RPC
-- Locks the org row, checks balance, decrements, inserts ledger entry — all in one transaction.
CREATE OR REPLACE FUNCTION reserve_credits(
  p_org_id UUID,
  p_amount INT,
  p_reason TEXT,
  p_reference_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_balance INT;
  v_ledger_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive, got %', p_amount;
  END IF;

  -- Lock the org row to prevent concurrent reservations
  SELECT ai_credits_remaining INTO v_balance
  FROM dtn_organizations WHERE id = p_org_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found: %', p_org_id;
  END IF;

  -- Unlimited plans (credits = -1) bypass balance check
  IF v_balance = -1 THEN
    INSERT INTO dtn_credit_ledger (org_id, amount, balance_after, reason, status, reference_id)
    VALUES (p_org_id, -p_amount, -1, p_reason, 'reserved', p_reference_id)
    RETURNING id INTO v_ledger_id;
    RETURN v_ledger_id;
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient credits: have %, need %', v_balance, p_amount;
  END IF;

  UPDATE dtn_organizations
  SET ai_credits_remaining = v_balance - p_amount
  WHERE id = p_org_id;

  INSERT INTO dtn_credit_ledger (org_id, amount, balance_after, reason, status, reference_id)
  VALUES (p_org_id, -p_amount, v_balance - p_amount, p_reason, 'reserved', p_reference_id)
  RETURNING id INTO v_ledger_id;

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Confirm a reserved credit charge (reserved → confirmed)
CREATE OR REPLACE FUNCTION confirm_credits(
  p_ledger_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE dtn_credit_ledger
  SET status = 'confirmed'
  WHERE id = p_ledger_id AND status = 'reserved';

  IF NOT FOUND THEN
    -- Idempotent: already confirmed is fine, but refunded is an error
    IF EXISTS (SELECT 1 FROM dtn_credit_ledger WHERE id = p_ledger_id AND status = 'confirmed') THEN
      RETURN; -- already confirmed, no-op
    END IF;
    RAISE EXCEPTION 'Cannot confirm ledger entry %: not found or already refunded', p_ledger_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Refund a reserved credit charge (reserved → refunded, restores balance)
CREATE OR REPLACE FUNCTION refund_credits(
  p_ledger_id UUID
) RETURNS VOID AS $$
DECLARE
  v_entry RECORD;
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

  -- Restore balance (amount is negative for debits, so subtract it to add back)
  UPDATE dtn_organizations
  SET ai_credits_remaining = CASE
    WHEN ai_credits_remaining = -1 THEN -1  -- unlimited stays unlimited
    ELSE ai_credits_remaining + ABS(v_entry.amount)
  END
  WHERE id = v_entry.org_id;

  UPDATE dtn_credit_ledger
  SET status = 'refunded'
  WHERE id = p_ledger_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. Refund all reserved entries for a reference (e.g., task_id).
-- Used by Inngest onFailure which has taskId but not ledgerId.
CREATE OR REPLACE FUNCTION refund_credits_by_reference(
  p_org_id UUID,
  p_reference_id UUID
) RETURNS INT AS $$
DECLARE
  v_entry RECORD;
  v_count INT := 0;
BEGIN
  FOR v_entry IN
    SELECT id FROM dtn_credit_ledger
    WHERE org_id = p_org_id
      AND reference_id = p_reference_id
      AND status = 'reserved'
    FOR UPDATE
  LOOP
    PERFORM refund_credits(v_entry.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;
