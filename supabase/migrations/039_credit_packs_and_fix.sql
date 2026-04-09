-- Credit packs: grant_credits + reset_credits RPCs, and fix missing initial credits
-- for accounts created before the ledger insert was added.

BEGIN;

-- ─── 1. grant_credits RPC ───────────────────────────────────────
-- Atomically increments ai_credits_remaining and inserts a confirmed
-- ledger entry. Used by the Stripe webhook after a credit pack purchase.

CREATE OR REPLACE FUNCTION grant_credits(
  p_org_id UUID,
  p_amount INT,
  p_reason TEXT
) RETURNS TABLE(new_balance INT, ledger_id UUID) AS $$
DECLARE
  v_balance INT;
  v_ledger_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive, got %', p_amount;
  END IF;

  -- Lock the org row to prevent concurrent balance modifications
  SELECT ai_credits_remaining INTO v_balance
  FROM dtn_organizations WHERE id = p_org_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found: %', p_org_id;
  END IF;

  -- Unlimited plans: record the grant but don't change balance
  IF v_balance = -1 THEN
    INSERT INTO dtn_credit_ledger (org_id, amount, balance_after, reason, status)
    VALUES (p_org_id, p_amount, -1, p_reason, 'confirmed')
    RETURNING id INTO v_ledger_id;
    RETURN QUERY SELECT -1, v_ledger_id;
    RETURN;
  END IF;

  UPDATE dtn_organizations
  SET ai_credits_remaining = v_balance + p_amount
  WHERE id = p_org_id;

  INSERT INTO dtn_credit_ledger (org_id, amount, balance_after, reason, status)
  VALUES (p_org_id, p_amount, v_balance + p_amount, p_reason, 'confirmed')
  RETURNING id INTO v_ledger_id;

  RETURN QUERY SELECT v_balance + p_amount, v_ledger_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── 2. reset_credits RPC ───────────────────────────────────────
-- Atomically resets credits on billing cycle renewal, preserving any
-- purchased surplus using GREATEST. Prevents TOCTOU races.

CREATE OR REPLACE FUNCTION reset_credits(
  p_org_id UUID,
  p_plan_credits INT
) RETURNS INT AS $$
DECLARE
  v_new_balance INT;
BEGIN
  UPDATE dtn_organizations
  SET ai_credits_remaining = GREATEST(p_plan_credits, ai_credits_remaining),
      ai_credits_reset_at = now()
  WHERE id = p_org_id
    AND ai_credits_remaining != -1
  RETURNING ai_credits_remaining INTO v_new_balance;

  IF NOT FOUND THEN
    -- Either org not found or unlimited plan — return -1
    SELECT ai_credits_remaining INTO v_new_balance
    FROM dtn_organizations WHERE id = p_org_id;
    RETURN COALESCE(v_new_balance, -1);
  END IF;

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── 3. Fix missing initial credits for liamnguyen.mail@gmail.com ─
-- The org was created but the ledger audit entry may be missing.
-- The column DEFAULT (50) likely set ai_credits_remaining on creation,
-- so we only set it to 50 if the org is truly uninitialized (0 balance
-- AND zero ledger entries).

DO $$
DECLARE
  v_org_id UUID;
  v_current_balance INT;
  v_ledger_count INT;
  v_has_grant BOOLEAN;
BEGIN
  -- Find the org for this user
  SELECT o.id, o.ai_credits_remaining
  INTO v_org_id, v_current_balance
  FROM auth.users u
  JOIN dtn_memberships m ON m.user_id = u.id AND m.is_active = true
  JOIN dtn_organizations o ON o.id = m.org_id
  WHERE u.email = 'liamnguyen.mail@gmail.com'
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE NOTICE 'No org found for liamnguyen.mail@gmail.com — skipping';
    RETURN;
  END IF;

  -- Check if the initial grant ledger entry already exists
  SELECT EXISTS(
    SELECT 1 FROM dtn_credit_ledger
    WHERE org_id = v_org_id
      AND reason = 'Initial free-tier grant (50 credits)'
  ) INTO v_has_grant;

  IF v_has_grant THEN
    RAISE NOTICE 'Initial grant ledger entry already exists for org % — skipping', v_org_id;
    RETURN;
  END IF;

  -- Count total ledger entries for this org
  SELECT COUNT(*) INTO v_ledger_count
  FROM dtn_credit_ledger
  WHERE org_id = v_org_id;

  -- If truly uninitialized (0 balance AND no ledger entries), set balance to 50
  IF v_current_balance = 0 AND v_ledger_count = 0 THEN
    UPDATE dtn_organizations
    SET ai_credits_remaining = 50
    WHERE id = v_org_id;

    INSERT INTO dtn_credit_ledger (org_id, amount, balance_after, reason, status)
    VALUES (v_org_id, 50, 50, 'Initial free-tier grant (50 credits)', 'confirmed');

    RAISE NOTICE 'Granted 50 initial credits to org % (balance was 0, no ledger entries)', v_org_id;
  ELSE
    -- Org has activity — only insert the audit entry, don't change balance
    INSERT INTO dtn_credit_ledger (org_id, amount, balance_after, reason, status)
    VALUES (v_org_id, 50, v_current_balance, 'Initial free-tier grant (50 credits)', 'confirmed');

    RAISE NOTICE 'Inserted audit entry for org % (balance %, % ledger entries already exist)', v_org_id, v_current_balance, v_ledger_count;
  END IF;
END;
$$;

COMMIT;
