-- Phase 0B: Seed 50 credits for free-tier users
-- Previously free tier started with 0 credits, locking out all AI features.
-- New orgs now start with 50 credits so users can try AI features immediately.

BEGIN;

-- 1. Change default so new orgs start with 50 credits
ALTER TABLE dtn_organizations
  ALTER COLUMN ai_credits_remaining SET DEFAULT 50;

-- 2. Grant 50 credits to existing free-tier orgs that have 0 credits
-- (Don't touch orgs that already have credits or are on paid plans)
UPDATE dtn_organizations
SET ai_credits_remaining = 50
WHERE plan = 'free'
  AND ai_credits_remaining = 0;

-- 3. Record the grant in the credit ledger for audit trail
INSERT INTO dtn_credit_ledger (org_id, amount, balance_after, reason, status)
SELECT
  id,
  50,
  50,
  'Initial free-tier grant (50 credits)',
  'confirmed'
FROM dtn_organizations
WHERE plan = 'free'
  AND ai_credits_remaining = 50;

COMMIT;
