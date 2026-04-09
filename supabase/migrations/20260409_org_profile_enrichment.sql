-- Migration: Add enrichment fields for strategy generation context
-- Product description, value proposition, website, and target customer

ALTER TABLE dtn_organizations
  ADD COLUMN product_description TEXT,
  ADD COLUMN value_proposition TEXT,
  ADD COLUMN website_url TEXT,
  ADD COLUMN target_customer TEXT;

COMMENT ON COLUMN dtn_organizations.product_description IS
  'Brief description of the product or service. Used for AI strategy generation.';
COMMENT ON COLUMN dtn_organizations.value_proposition IS
  'Key differentiator or value proposition. Used for AI strategy generation.';
COMMENT ON COLUMN dtn_organizations.website_url IS
  'Company website URL. Used for AI strategy generation context.';
COMMENT ON COLUMN dtn_organizations.target_customer IS
  'Description of target customer/ICP. Used for AI strategy generation.';
