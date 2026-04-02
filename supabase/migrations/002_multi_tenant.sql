-- =============================================================================
-- 002: MULTI-TENANT EXTENSION
-- =============================================================================
-- Adds organizations, memberships, departments, daily tasks, approval queue,
-- social credentials, blog posts, Stripe subscriptions, and org_id to all
-- existing mktg_* tables.
-- =============================================================================

-- Enable Vault extension for credential encryption
CREATE EXTENSION IF NOT EXISTS "pgsodium";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";

-- =============================================================================
-- 1. CORE MULTI-TENANCY TABLES
-- =============================================================================

CREATE TABLE dtn_organizations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,
  logo_url              TEXT,
  stripe_customer_id    TEXT,
  stripe_subscription_id TEXT,
  plan                  TEXT NOT NULL DEFAULT 'free'
                        CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  plan_status           TEXT NOT NULL DEFAULT 'active'
                        CHECK (plan_status IN ('trialing', 'active', 'past_due', 'canceled')),
  settings              JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dtn_orgs_slug ON dtn_organizations(slug);

CREATE TABLE dtn_memberships (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('owner', 'admin', 'member')),
  invited_by    UUID REFERENCES auth.users(id),
  invited_email TEXT,
  invited_at    TIMESTAMPTZ DEFAULT now(),
  accepted_at   TIMESTAMPTZ,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_dtn_memberships_unique ON dtn_memberships(org_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_dtn_memberships_user ON dtn_memberships(user_id);
CREATE INDEX idx_dtn_memberships_org ON dtn_memberships(org_id);

CREATE TABLE dtn_departments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  name          TEXT NOT NULL,
  icon          TEXT,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, slug)
);

CREATE INDEX idx_dtn_departments_org ON dtn_departments(org_id);

-- =============================================================================
-- 2. DAILY TASKS
-- =============================================================================

CREATE TABLE dtn_daily_tasks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  department_id     UUID REFERENCES dtn_departments(id),
  created_by        UUID REFERENCES auth.users(id),
  assigned_to       UUID REFERENCES auth.users(id),

  title             TEXT NOT NULL,
  description       TEXT,
  task_type         TEXT NOT NULL DEFAULT 'action'
                    CHECK (task_type IN ('action', 'review', 'create', 'outreach', 'analysis')),
  priority          TEXT NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  executor_type     TEXT NOT NULL DEFAULT 'self'
                    CHECK (executor_type IN ('self', 'n8n', 'claude_api', 'freelancer')),
  executor_config   JSONB DEFAULT '{}',
  mktg_task_id      UUID,  -- FK added after org_id migration on mktg_tasks

  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'waiting_approval', 'completed', 'skipped', 'failed', 'carried_over')),
  scheduled_date    DATE NOT NULL DEFAULT CURRENT_DATE,

  outcome_notes     TEXT,
  completed_at      TIMESTAMPTZ,

  source_strategy   TEXT,
  campaign_id       UUID,  -- FK added after org_id migration on mktg_campaigns
  contact_id        UUID,  -- FK added after org_id migration on mktg_contacts

  generated_by      TEXT DEFAULT 'user'
                    CHECK (generated_by IN ('user', 'claude', 'system')),
  generation_context JSONB DEFAULT '{}',

  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dtn_daily_tasks_org ON dtn_daily_tasks(org_id);
CREATE INDEX idx_dtn_daily_tasks_date ON dtn_daily_tasks(scheduled_date);
CREATE INDEX idx_dtn_daily_tasks_status ON dtn_daily_tasks(status);
CREATE INDEX idx_dtn_daily_tasks_executor ON dtn_daily_tasks(executor_type);
CREATE INDEX idx_dtn_daily_tasks_assigned ON dtn_daily_tasks(assigned_to);

-- =============================================================================
-- 3. APPROVAL QUEUE
-- =============================================================================

CREATE TABLE dtn_approval_queue (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  department_id     UUID REFERENCES dtn_departments(id),

  item_type         TEXT NOT NULL
                    CHECK (item_type IN ('social_post', 'blog_post', 'email_draft', 'task_submission', 'strategy_change')),
  title             TEXT NOT NULL,
  content           TEXT NOT NULL,
  metadata          JSONB DEFAULT '{}',

  submitted_by_type TEXT NOT NULL
                    CHECK (submitted_by_type IN ('freelancer', 'n8n', 'claude_api', 'member')),
  submitted_by_id   UUID,
  assigned_reviewer UUID REFERENCES auth.users(id),
  daily_task_id     UUID REFERENCES dtn_daily_tasks(id),

  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'revision_requested')),
  reviewer_notes    TEXT,
  reviewed_at       TIMESTAMPTZ,
  publish_config    JSONB DEFAULT '{}',

  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dtn_approvals_org ON dtn_approval_queue(org_id);
CREATE INDEX idx_dtn_approvals_status ON dtn_approval_queue(status);
CREATE INDEX idx_dtn_approvals_reviewer ON dtn_approval_queue(assigned_reviewer);

-- =============================================================================
-- 4. SOCIAL CREDENTIALS (Vault-encrypted)
-- =============================================================================

CREATE TABLE dtn_social_credentials (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                    UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,

  platform                  TEXT NOT NULL
                            CHECK (platform IN ('twitter', 'linkedin', 'instagram', 'tiktok', 'facebook', 'reddit', 'threads', 'bluesky', 'youtube')),
  account_name              TEXT NOT NULL,

  -- References to Supabase Vault secrets
  credentials_secret_id     UUID,
  access_token_secret_id    UUID,
  refresh_token_secret_id   UUID,
  token_expires_at          TIMESTAMPTZ,

  share_with_freelancers    BOOLEAN DEFAULT false,
  share_with_automations    BOOLEAN DEFAULT true,

  is_active                 BOOLEAN DEFAULT true,
  last_used_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dtn_social_creds_org ON dtn_social_credentials(org_id);
CREATE UNIQUE INDEX idx_dtn_social_creds_unique ON dtn_social_credentials(org_id, platform, account_name);

-- =============================================================================
-- 5. BLOG POSTS
-- =============================================================================

CREATE TABLE dtn_blog_posts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  department_id     UUID REFERENCES dtn_departments(id),
  user_id           UUID REFERENCES auth.users(id),

  title             TEXT NOT NULL,
  slug              TEXT NOT NULL,
  content           TEXT NOT NULL,
  excerpt           TEXT,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'review', 'approved', 'published', 'archived')),

  author            TEXT,
  tags              TEXT[] DEFAULT '{}',
  seo_title         TEXT,
  seo_description   TEXT,

  published_at      TIMESTAMPTZ,
  campaign_id       UUID,

  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dtn_blog_posts_org ON dtn_blog_posts(org_id);
CREATE INDEX idx_dtn_blog_posts_status ON dtn_blog_posts(status);
CREATE UNIQUE INDEX idx_dtn_blog_posts_slug ON dtn_blog_posts(org_id, slug);

-- =============================================================================
-- 6. STRIPE SUBSCRIPTIONS & EVENT LOG
-- =============================================================================

CREATE TABLE dtn_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                  UUID NOT NULL REFERENCES dtn_organizations(id) ON DELETE CASCADE,
  stripe_subscription_id  TEXT NOT NULL UNIQUE,
  stripe_customer_id      TEXT NOT NULL,
  plan                    TEXT NOT NULL,
  status                  TEXT NOT NULL,
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at               TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dtn_subscriptions_org ON dtn_subscriptions(org_id);

CREATE TABLE dtn_stripe_events (
  id            TEXT PRIMARY KEY,  -- Stripe event ID
  event_type    TEXT NOT NULL,
  processed_at  TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 7. ADD org_id TO EXISTING mktg_* TABLES
-- =============================================================================
-- Pattern: add nullable → backfill → set NOT NULL

-- Step 1: Add nullable org_id columns
ALTER TABLE mktg_contacts ADD COLUMN org_id UUID REFERENCES dtn_organizations(id);
ALTER TABLE mktg_outreach_log ADD COLUMN org_id UUID REFERENCES dtn_organizations(id);
ALTER TABLE mktg_campaigns ADD COLUMN org_id UUID REFERENCES dtn_organizations(id);
ALTER TABLE mktg_strategy_docs ADD COLUMN org_id UUID REFERENCES dtn_organizations(id);
ALTER TABLE mktg_competitors ADD COLUMN org_id UUID REFERENCES dtn_organizations(id);
ALTER TABLE mktg_insights ADD COLUMN org_id UUID REFERENCES dtn_organizations(id);
ALTER TABLE mktg_freelancers ADD COLUMN org_id UUID REFERENCES dtn_organizations(id);
ALTER TABLE mktg_tasks ADD COLUMN org_id UUID REFERENCES dtn_organizations(id);
ALTER TABLE mktg_task_submissions ADD COLUMN org_id UUID REFERENCES dtn_organizations(id);
ALTER TABLE mktg_task_messages ADD COLUMN org_id UUID REFERENCES dtn_organizations(id);
ALTER TABLE mktg_weekly_reviews ADD COLUMN org_id UUID REFERENCES dtn_organizations(id);

-- Step 2: Backfill any existing rows with a bootstrap org
-- (If tables are empty this is a no-op, which is fine)
DO $$
DECLARE
  bootstrap_org_id UUID;
BEGIN
  -- Create bootstrap org if any mktg_ table has data
  IF EXISTS (SELECT 1 FROM mktg_contacts LIMIT 1) OR
     EXISTS (SELECT 1 FROM mktg_campaigns LIMIT 1) OR
     EXISTS (SELECT 1 FROM mktg_strategy_docs LIMIT 1) OR
     EXISTS (SELECT 1 FROM mktg_tasks LIMIT 1) THEN

    INSERT INTO dtn_organizations (name, slug, plan, plan_status)
    VALUES ('Bootstrap Organization', 'bootstrap-org', 'free', 'active')
    RETURNING id INTO bootstrap_org_id;

    UPDATE mktg_contacts SET org_id = bootstrap_org_id WHERE org_id IS NULL;
    UPDATE mktg_outreach_log SET org_id = bootstrap_org_id WHERE org_id IS NULL;
    UPDATE mktg_campaigns SET org_id = bootstrap_org_id WHERE org_id IS NULL;
    UPDATE mktg_strategy_docs SET org_id = bootstrap_org_id WHERE org_id IS NULL;
    UPDATE mktg_competitors SET org_id = bootstrap_org_id WHERE org_id IS NULL;
    UPDATE mktg_insights SET org_id = bootstrap_org_id WHERE org_id IS NULL;
    UPDATE mktg_freelancers SET org_id = bootstrap_org_id WHERE org_id IS NULL;
    UPDATE mktg_tasks SET org_id = bootstrap_org_id WHERE org_id IS NULL;
    UPDATE mktg_task_submissions SET org_id = bootstrap_org_id WHERE org_id IS NULL;
    UPDATE mktg_task_messages SET org_id = bootstrap_org_id WHERE org_id IS NULL;
    UPDATE mktg_weekly_reviews SET org_id = bootstrap_org_id WHERE org_id IS NULL;
  END IF;
END $$;

-- Step 3: Set NOT NULL constraints
ALTER TABLE mktg_contacts ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE mktg_outreach_log ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE mktg_campaigns ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE mktg_strategy_docs ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE mktg_competitors ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE mktg_insights ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE mktg_freelancers ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE mktg_tasks ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE mktg_task_submissions ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE mktg_task_messages ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE mktg_weekly_reviews ALTER COLUMN org_id SET NOT NULL;

-- Add org_id indexes on existing tables
CREATE INDEX idx_mktg_contacts_org ON mktg_contacts(org_id);
CREATE INDEX idx_mktg_outreach_org ON mktg_outreach_log(org_id);
CREATE INDEX idx_mktg_campaigns_org ON mktg_campaigns(org_id);
CREATE INDEX idx_mktg_strategy_docs_org ON mktg_strategy_docs(org_id);
CREATE INDEX idx_mktg_competitors_org ON mktg_competitors(org_id);
CREATE INDEX idx_mktg_insights_org ON mktg_insights(org_id);
CREATE INDEX idx_mktg_freelancers_org ON mktg_freelancers(org_id);
CREATE INDEX idx_mktg_tasks_org ON mktg_tasks(org_id);
CREATE INDEX idx_mktg_task_submissions_org ON mktg_task_submissions(org_id);
CREATE INDEX idx_mktg_task_messages_org ON mktg_task_messages(org_id);
CREATE INDEX idx_mktg_weekly_reviews_org ON mktg_weekly_reviews(org_id);

-- Now add FKs to dtn_daily_tasks that reference mktg_* tables
ALTER TABLE dtn_daily_tasks
  ADD CONSTRAINT fk_daily_tasks_mktg_task FOREIGN KEY (mktg_task_id) REFERENCES mktg_tasks(id),
  ADD CONSTRAINT fk_daily_tasks_campaign FOREIGN KEY (campaign_id) REFERENCES mktg_campaigns(id),
  ADD CONSTRAINT fk_daily_tasks_contact FOREIGN KEY (contact_id) REFERENCES mktg_contacts(id);

-- =============================================================================
-- 8. UPDATE VIEWS WITH org_id
-- =============================================================================

CREATE OR REPLACE VIEW mktg_pipeline_summary AS
SELECT
  org_id,
  lifecycle_stage,
  contact_type,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE last_engaged > now() - interval '7 days') as engaged_last_7d,
  COUNT(*) FILTER (WHERE last_engaged > now() - interval '30 days') as engaged_last_30d,
  AVG(lead_score) as avg_lead_score
FROM mktg_contacts
WHERE status = 'active'
GROUP BY org_id, lifecycle_stage, contact_type
ORDER BY org_id, lifecycle_stage, contact_type;

CREATE OR REPLACE VIEW mktg_freelancer_leaderboard AS
SELECT
  f.org_id,
  f.id,
  f.name,
  f.skills,
  f.tasks_completed,
  f.avg_rating,
  f.reliability_score,
  f.hourly_rate,
  COUNT(t.id) FILTER (WHERE t.status = 'in_progress') as active_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'completed') as completed_tasks
FROM mktg_freelancers f
LEFT JOIN mktg_tasks t ON t.assigned_to = f.id
WHERE f.available = true
GROUP BY f.org_id, f.id
ORDER BY f.avg_rating DESC NULLS LAST, f.tasks_completed DESC;

-- Daily tasks summary view
CREATE OR REPLACE VIEW dtn_daily_tasks_summary AS
SELECT
  org_id,
  scheduled_date,
  executor_type,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM dtn_daily_tasks
GROUP BY org_id, scheduled_date, executor_type
ORDER BY scheduled_date DESC;

-- =============================================================================
-- 9. RLS POLICIES FOR NEW TABLES
-- =============================================================================

ALTER TABLE dtn_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dtn_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE dtn_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE dtn_daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE dtn_approval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE dtn_social_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE dtn_blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dtn_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dtn_stripe_events ENABLE ROW LEVEL SECURITY;

-- Service role: full access on all new tables
CREATE POLICY "Service role full access" ON dtn_organizations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON dtn_memberships FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON dtn_departments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON dtn_daily_tasks FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON dtn_approval_queue FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON dtn_social_credentials FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON dtn_blog_posts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON dtn_subscriptions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON dtn_stripe_events FOR ALL USING (auth.role() = 'service_role');

-- Authenticated users: see orgs they belong to
CREATE POLICY "Members see own orgs" ON dtn_organizations
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Members see own memberships" ON dtn_memberships
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

-- Org-scoped read/write for authenticated users (member of the org)
CREATE POLICY "Members access departments" ON dtn_departments
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Members access daily tasks" ON dtn_daily_tasks
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Members access approvals" ON dtn_approval_queue
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Members access social creds" ON dtn_social_credentials
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Members access blog posts" ON dtn_blog_posts
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Members access subscriptions" ON dtn_subscriptions
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

-- Update existing mktg_* RLS policies to also allow org members
-- (Keep existing service_role and freelancer policies, add org member policies)

CREATE POLICY "Members access contacts" ON mktg_contacts
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Members access outreach" ON mktg_outreach_log
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Members access campaigns" ON mktg_campaigns
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Members access strategy docs" ON mktg_strategy_docs
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Members access competitors" ON mktg_competitors
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Members access insights" ON mktg_insights
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Members access freelancers" ON mktg_freelancers
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Members access tasks" ON mktg_tasks
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Members access submissions" ON mktg_task_submissions
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Members access messages" ON mktg_task_messages
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Members access weekly reviews" ON mktg_weekly_reviews
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    org_id IN (SELECT org_id FROM dtn_memberships WHERE user_id = auth.uid() AND is_active = true)
  );

-- =============================================================================
-- 10. TRIGGERS FOR NEW TABLES
-- =============================================================================

CREATE TRIGGER update_dtn_organizations_timestamp BEFORE UPDATE ON dtn_organizations
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();
CREATE TRIGGER update_dtn_daily_tasks_timestamp BEFORE UPDATE ON dtn_daily_tasks
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();
CREATE TRIGGER update_dtn_approval_queue_timestamp BEFORE UPDATE ON dtn_approval_queue
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();
CREATE TRIGGER update_dtn_social_credentials_timestamp BEFORE UPDATE ON dtn_social_credentials
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();
CREATE TRIGGER update_dtn_blog_posts_timestamp BEFORE UPDATE ON dtn_blog_posts
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();
CREATE TRIGGER update_dtn_subscriptions_timestamp BEFORE UPDATE ON dtn_subscriptions
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();

-- =============================================================================
-- 11. REALTIME CONFIGURATION
-- =============================================================================

ALTER TABLE dtn_daily_tasks REPLICA IDENTITY FULL;
ALTER TABLE dtn_approval_queue REPLICA IDENTITY FULL;
ALTER TABLE mktg_task_submissions REPLICA IDENTITY FULL;
