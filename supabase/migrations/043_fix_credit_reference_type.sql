-- Fix credit ledger reference_id type: uuid → text
--
-- The task-decomposition Inngest function passes descriptive strings like
-- "decompose-{orgId}-{date}" as reference_id for idempotent refunds.
-- The column and RPC params were typed as uuid, causing a cast error that
-- blocked all daily task generation.
--
-- NOTE: Requires ACCESS EXCLUSIVE lock on dtn_credit_ledger.
-- Safe to run now (table is small/empty). For large tables, use a staged
-- column swap with CREATE INDEX CONCURRENTLY.

BEGIN;

-- 0. Drop old uuid-param overloads to avoid PostgREST ambiguity
DROP FUNCTION IF EXISTS reserve_credits(uuid, integer, text, uuid);
DROP FUNCTION IF EXISTS refund_credits_by_reference(uuid, uuid);

-- 1. Change column type
ALTER TABLE dtn_credit_ledger ALTER COLUMN reference_id TYPE text;

-- 2. Recreate reserve_credits with text param
CREATE OR REPLACE FUNCTION reserve_credits(
  p_org_id uuid, p_amount integer, p_reason text, p_reference_id text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_balance INT;
  v_ledger_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive, got %', p_amount;
  END IF;

  SELECT ai_credits_remaining INTO v_balance
  FROM dtn_organizations WHERE id = p_org_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found: %', p_org_id;
  END IF;

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
$$;

-- 3. Recreate refund_credits_by_reference with text param
CREATE OR REPLACE FUNCTION refund_credits_by_reference(
  p_org_id uuid, p_reference_id text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

COMMIT;
