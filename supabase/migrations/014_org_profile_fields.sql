-- Migration 014: Add org profile fields for onboarding wizard
-- Phase 2C — industry, stage, budget tier, growth motion, timezone, onboarding tracking

ALTER TABLE dtn_organizations
  ADD COLUMN industry      TEXT CHECK (industry IN ('b2b_saas', 'dev_tools', 'dtc_ecommerce', 'fintech', 'marketplace', 'healthtech', 'other')),
  ADD COLUMN stage         TEXT CHECK (stage IN ('idea', 'early', 'growth', 'scaling')),
  ADD COLUMN budget_tier   TEXT CHECK (budget_tier IN ('bootstrap', 'growth', 'scale')),
  ADD COLUMN growth_motion TEXT CHECK (growth_motion IN ('product_led', 'sales_led', 'content_led', 'community_led', 'paid_acquisition')),
  ADD COLUMN timezone      TEXT DEFAULT 'America/New_York',
  ADD COLUMN onboarding_completed_at TIMESTAMPTZ;

-- Backfill: mark all pre-existing orgs as onboarding-complete so they
-- are not locked out of the dashboard by the new redirect guard.
UPDATE dtn_organizations
  SET onboarding_completed_at = created_at
  WHERE onboarding_completed_at IS NULL;
