-- Migration 003: Simplify billing plans from 4-tier to 2-tier (free + premium)
-- Updates the CHECK constraint on dtn_organizations.plan

-- Drop and recreate the plan CHECK constraint
ALTER TABLE dtn_organizations DROP CONSTRAINT IF EXISTS dtn_organizations_plan_check;
ALTER TABLE dtn_organizations ADD CONSTRAINT dtn_organizations_plan_check
  CHECK (plan IN ('free', 'premium'));

-- Update any existing rows that have old plan values to 'free'
UPDATE dtn_organizations SET plan = 'free' WHERE plan NOT IN ('free', 'premium');
