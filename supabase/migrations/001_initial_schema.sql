-- =============================================================================
-- MARKETING OPS PLATFORM - Supabase Migration
-- =============================================================================
-- Adds CRM, strategy hub, and talent marketplace tables alongside
-- your existing BridgeCalm schema. All tables prefixed with "mktg_" to
-- avoid collisions with existing tables.
--
-- Run this in your Supabase SQL Editor or save as a migration file.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";  -- for strategy doc embeddings (pgvector)

-- =============================================================================
-- 1. CRM TABLES
-- =============================================================================

-- Contacts: the people/orgs you're marketing to or partnering with
CREATE TABLE mktg_contacts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id      UUID REFERENCES auth.users(id),  -- which team member owns this contact

  -- Identity
  first_name    TEXT NOT NULL,
  last_name     TEXT,
  email         TEXT,
  phone         TEXT,
  company       TEXT,
  title         TEXT,

  -- Classification
  contact_type  TEXT NOT NULL DEFAULT 'lead'
                CHECK (contact_type IN ('lead', 'prospect', 'customer', 'partner', 'therapist', 'influencer', 'media', 'other')),
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive', 'do_not_contact', 'churned')),
  lifecycle_stage TEXT DEFAULT 'awareness'
                CHECK (lifecycle_stage IN ('awareness', 'consideration', 'decision', 'customer', 'advocate')),

  -- Segmentation
  tags          TEXT[] DEFAULT '{}',
  location      TEXT,
  source        TEXT,                             -- how did we find them (reddit, linkedin, referral, etc.)
  persona       TEXT,                             -- maps to your strategy doc personas

  -- Scoring
  lead_score    INTEGER DEFAULT 0,
  last_engaged  TIMESTAMPTZ,

  -- Notes (Claude can read/write these)
  notes         TEXT,

  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Index for common queries Claude will make
CREATE INDEX idx_mktg_contacts_type ON mktg_contacts(contact_type);
CREATE INDEX idx_mktg_contacts_status ON mktg_contacts(status);
CREATE INDEX idx_mktg_contacts_tags ON mktg_contacts USING GIN(tags);
CREATE INDEX idx_mktg_contacts_owner ON mktg_contacts(owner_id);

-- Outreach log: every touchpoint with a contact
CREATE TABLE mktg_outreach_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id    UUID NOT NULL REFERENCES mktg_contacts(id) ON DELETE CASCADE,

  channel       TEXT NOT NULL
                CHECK (channel IN ('email', 'linkedin', 'reddit', 'twitter', 'phone', 'in_person', 'tiktok', 'instagram', 'other')),
  direction     TEXT NOT NULL DEFAULT 'outbound'
                CHECK (direction IN ('outbound', 'inbound')),

  subject       TEXT,
  content       TEXT,                             -- the actual message or summary

  status        TEXT DEFAULT 'sent'
                CHECK (status IN ('drafted', 'sent', 'delivered', 'opened', 'replied', 'bounced', 'no_response')),

  -- Persona/angle tracking (ties to your strategy doc)
  persona_used  TEXT,                             -- which Reddit persona, brand voice, etc.
  campaign_id   UUID,                             -- optional link to a campaign

  sent_at       TIMESTAMPTZ DEFAULT now(),
  response_at   TIMESTAMPTZ,

  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mktg_outreach_contact ON mktg_outreach_log(contact_id);
CREATE INDEX idx_mktg_outreach_channel ON mktg_outreach_log(channel);
CREATE INDEX idx_mktg_outreach_status ON mktg_outreach_log(status);

-- Campaigns: group outreach and content around a theme
CREATE TABLE mktg_campaigns (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  name          TEXT NOT NULL,
  description   TEXT,
  campaign_type TEXT NOT NULL
                CHECK (campaign_type IN ('email_sequence', 'content_series', 'social_campaign', 'launch', 'partnership', 'event', 'other')),
  status        TEXT DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),

  -- Targeting
  target_persona TEXT,
  target_tags   TEXT[] DEFAULT '{}',

  -- Performance
  budget        NUMERIC(10,2),
  spend         NUMERIC(10,2) DEFAULT 0,

  -- Dates
  start_date    DATE,
  end_date      DATE,

  -- KPIs (Claude populates these during weekly reviews)
  kpis          JSONB DEFAULT '{}',  -- { impressions, clicks, conversions, etc. }

  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 2. STRATEGY HUB TABLES
-- =============================================================================

-- Strategy documents: your marketing brain's long-term memory
CREATE TABLE mktg_strategy_docs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  doc_type      TEXT NOT NULL
                CHECK (doc_type IN (
                  'master_strategy', 'competitive_analysis', 'value_props',
                  'brand_voice', 'personas', 'positioning', 'content_calendar',
                  'channel_strategy', 'pricing_strategy', 'playbook', 'other'
                )),
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,                    -- full markdown content
  version       INTEGER DEFAULT 1,

  -- Metadata for retrieval
  tags          TEXT[] DEFAULT '{}',

  -- Versioning
  previous_version_id UUID REFERENCES mktg_strategy_docs(id),
  change_summary      TEXT,                       -- what changed and why
  changed_by          TEXT DEFAULT 'claude',       -- 'claude' or 'user'

  -- Embedding for RAG retrieval
  embedding     vector(1536),                     -- for semantic search

  is_active     BOOLEAN DEFAULT true,             -- only one active version per doc_type
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mktg_strategy_type ON mktg_strategy_docs(doc_type);
CREATE INDEX idx_mktg_strategy_active ON mktg_strategy_docs(is_active);
CREATE INDEX idx_mktg_strategy_embedding ON mktg_strategy_docs
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);

-- Competitive intelligence: structured competitor tracking
CREATE TABLE mktg_competitors (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  name          TEXT NOT NULL,
  website       TEXT,
  description   TEXT,

  -- Positioning
  target_market TEXT,
  pricing       TEXT,
  strengths     TEXT[] DEFAULT '{}',
  weaknesses    TEXT[] DEFAULT '{}',

  -- Intel
  latest_moves  TEXT,                             -- recent product launches, funding, etc.
  our_advantage TEXT,                             -- how we differentiate
  threat_level  TEXT DEFAULT 'medium'
                CHECK (threat_level IN ('low', 'medium', 'high', 'critical')),

  last_analyzed TIMESTAMPTZ,
  notes         TEXT,

  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Marketing insights: learnings Claude surfaces over time
CREATE TABLE mktg_insights (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  insight_type  TEXT NOT NULL
                CHECK (insight_type IN ('what_worked', 'what_failed', 'opportunity', 'trend', 'customer_feedback', 'metric_shift')),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,

  -- Source tracking
  source        TEXT,                             -- where this insight came from
  evidence      TEXT,                             -- data points supporting it

  -- Action
  action_taken  TEXT,
  impact        TEXT,

  tags          TEXT[] DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 3. TALENT MARKETPLACE TABLES
-- =============================================================================

-- Freelancers: people who can pick up tasks
CREATE TABLE mktg_freelancers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identity
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  portfolio_url TEXT,

  -- Skills & classification
  skills        TEXT[] DEFAULT '{}',              -- ['copywriting', 'social_media', 'design', 'video', 'seo']
  specialties   TEXT[] DEFAULT '{}',              -- ['mental_health', 'healthcare', 'b2c']
  experience_level TEXT DEFAULT 'mid'
                CHECK (experience_level IN ('junior', 'mid', 'senior', 'expert')),

  -- Rates
  hourly_rate   NUMERIC(8,2),
  currency      TEXT DEFAULT 'USD',

  -- Performance
  tasks_completed INTEGER DEFAULT 0,
  avg_rating    NUMERIC(3,2),
  reliability_score NUMERIC(3,2),                 -- on-time delivery rate

  -- Engagement
  engagement_type TEXT DEFAULT 'freelance'
                CHECK (engagement_type IN ('freelance', 'work_to_hire', 'both')),
  available     BOOLEAN DEFAULT true,

  -- What they can see (controls data sharing)
  nda_signed    BOOLEAN DEFAULT false,
  clearance_level TEXT DEFAULT 'basic'
                CHECK (clearance_level IN ('basic', 'standard', 'trusted', 'full')),

  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mktg_freelancers_skills ON mktg_freelancers USING GIN(skills);
CREATE INDEX idx_mktg_freelancers_available ON mktg_freelancers(available);

-- Tasks: work items that freelancers can claim
CREATE TABLE mktg_tasks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Task definition
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  task_type     TEXT NOT NULL
                CHECK (task_type IN (
                  'blog_post', 'social_content', 'email_copy', 'design',
                  'video', 'seo_audit', 'research', 'outreach', 'ad_copy',
                  'landing_page', 'case_study', 'other'
                )),

  -- Requirements
  required_skills TEXT[] DEFAULT '{}',
  min_experience  TEXT DEFAULT 'mid',
  deliverables    TEXT,                           -- what exactly needs to be submitted

  -- Context shared with freelancer (controlled exposure)
  brief         TEXT NOT NULL,                    -- the task brief (safe to share)
  brand_guidelines TEXT,                          -- relevant subset of brand voice doc
  reference_materials TEXT,                       -- links or excerpts freelancer needs
  -- NOTE: full strategy docs and competitive intel are NOT shared here

  -- Engagement terms
  engagement_type TEXT DEFAULT 'freelance'
                CHECK (engagement_type IN ('freelance', 'work_to_hire')),
  budget        NUMERIC(10,2),
  payment_type  TEXT DEFAULT 'fixed'
                CHECK (payment_type IN ('fixed', 'hourly', 'milestone')),

  -- Status
  status        TEXT DEFAULT 'draft'
                CHECK (status IN ('draft', 'open', 'claimed', 'in_progress', 'review', 'revision', 'completed', 'cancelled')),
  priority      TEXT DEFAULT 'medium'
                CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- Assignments
  assigned_to   UUID REFERENCES mktg_freelancers(id),
  campaign_id   UUID REFERENCES mktg_campaigns(id),

  -- Dates
  due_date      DATE,
  claimed_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,

  -- AI-generated fields
  generated_by_ai BOOLEAN DEFAULT false,          -- was this task auto-generated from strategy?
  source_strategy TEXT,                           -- which strategy doc spawned this task

  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mktg_tasks_status ON mktg_tasks(status);
CREATE INDEX idx_mktg_tasks_type ON mktg_tasks(task_type);
CREATE INDEX idx_mktg_tasks_assigned ON mktg_tasks(assigned_to);

-- Task submissions: freelancer deliverables
CREATE TABLE mktg_task_submissions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id       UUID NOT NULL REFERENCES mktg_tasks(id) ON DELETE CASCADE,
  freelancer_id UUID NOT NULL REFERENCES mktg_freelancers(id),

  -- Submission
  content       TEXT,                             -- the actual deliverable text
  file_urls     TEXT[] DEFAULT '{}',              -- links to uploaded files
  notes         TEXT,                             -- freelancer's notes

  -- Review
  status        TEXT DEFAULT 'submitted'
                CHECK (status IN ('submitted', 'under_review', 'approved', 'revision_requested', 'rejected')),
  reviewer_notes TEXT,                            -- your feedback
  ai_review     TEXT,                             -- Claude's assessment
  rating        INTEGER CHECK (rating >= 1 AND rating <= 5),

  submitted_at  TIMESTAMPTZ DEFAULT now(),
  reviewed_at   TIMESTAMPTZ
);

-- Task messages: communication between you and freelancers
CREATE TABLE mktg_task_messages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id       UUID NOT NULL REFERENCES mktg_tasks(id) ON DELETE CASCADE,

  sender_type   TEXT NOT NULL CHECK (sender_type IN ('owner', 'freelancer', 'ai')),
  sender_id     UUID,                             -- freelancer_id or null for owner/ai

  content       TEXT NOT NULL,

  -- Only share what's needed
  includes_strategy_context BOOLEAN DEFAULT false, -- flag if this message contains strategic info

  created_at    TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 4. WEEKLY REVIEW / KPI TRACKING
-- =============================================================================

CREATE TABLE mktg_weekly_reviews (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  week_start    DATE NOT NULL,
  week_end      DATE NOT NULL,

  -- KPIs (Claude populates from various sources)
  metrics       JSONB DEFAULT '{}',               -- { website_visits, signups, social_followers, etc. }

  -- Qualitative
  wins          TEXT[] DEFAULT '{}',
  challenges    TEXT[] DEFAULT '{}',
  learnings     TEXT[] DEFAULT '{}',

  -- Strategy updates
  strategy_changes TEXT,                          -- what Claude recommends changing
  next_week_priorities TEXT[] DEFAULT '{}',

  -- AI analysis
  ai_summary    TEXT,                             -- Claude's weekly narrative

  created_at    TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 5. ROW-LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all marketing tables
ALTER TABLE mktg_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mktg_outreach_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mktg_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE mktg_strategy_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mktg_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE mktg_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE mktg_freelancers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mktg_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE mktg_task_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mktg_task_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE mktg_weekly_reviews ENABLE ROW LEVEL SECURITY;

-- Service role policy (your MCP server uses service role key)
-- This gives your MCP server full access while keeping the freelancer
-- portal locked down via anon/authenticated role policies

CREATE POLICY "Service role full access" ON mktg_contacts
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON mktg_outreach_log
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON mktg_campaigns
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON mktg_strategy_docs
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON mktg_competitors
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON mktg_insights
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON mktg_freelancers
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON mktg_tasks
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON mktg_task_submissions
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON mktg_task_messages
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON mktg_weekly_reviews
  FOR ALL USING (auth.role() = 'service_role');

-- Freelancer policies: they only see their own tasks and submissions
-- (applied when freelancers access via the web portal with authenticated role)
CREATE POLICY "Freelancers see assigned tasks" ON mktg_tasks
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    assigned_to IN (
      SELECT id FROM mktg_freelancers WHERE email = auth.jwt()->>'email'
    ) AND
    status IN ('claimed', 'in_progress', 'review', 'revision', 'completed')
  );

CREATE POLICY "Freelancers see open tasks" ON mktg_tasks
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    status = 'open'
  );

CREATE POLICY "Freelancers manage own submissions" ON mktg_task_submissions
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    freelancer_id IN (
      SELECT id FROM mktg_freelancers WHERE email = auth.jwt()->>'email'
    )
  );

CREATE POLICY "Freelancers see task messages" ON mktg_task_messages
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    task_id IN (
      SELECT id FROM mktg_tasks WHERE assigned_to IN (
        SELECT id FROM mktg_freelancers WHERE email = auth.jwt()->>'email'
      )
    )
  );

-- =============================================================================
-- 6. HELPER FUNCTIONS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION mktg_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_mktg_contacts_timestamp BEFORE UPDATE ON mktg_contacts
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();
CREATE TRIGGER update_mktg_campaigns_timestamp BEFORE UPDATE ON mktg_campaigns
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();
CREATE TRIGGER update_mktg_strategy_docs_timestamp BEFORE UPDATE ON mktg_strategy_docs
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();
CREATE TRIGGER update_mktg_competitors_timestamp BEFORE UPDATE ON mktg_competitors
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();
CREATE TRIGGER update_mktg_freelancers_timestamp BEFORE UPDATE ON mktg_freelancers
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();
CREATE TRIGGER update_mktg_tasks_timestamp BEFORE UPDATE ON mktg_tasks
  FOR EACH ROW EXECUTE FUNCTION mktg_update_timestamp();

-- Handy view: pipeline summary for Claude to query quickly
CREATE OR REPLACE VIEW mktg_pipeline_summary AS
SELECT
  lifecycle_stage,
  contact_type,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE last_engaged > now() - interval '7 days') as engaged_last_7d,
  COUNT(*) FILTER (WHERE last_engaged > now() - interval '30 days') as engaged_last_30d,
  AVG(lead_score) as avg_lead_score
FROM mktg_contacts
WHERE status = 'active'
GROUP BY lifecycle_stage, contact_type
ORDER BY lifecycle_stage, contact_type;

-- View: freelancer leaderboard
CREATE OR REPLACE VIEW mktg_freelancer_leaderboard AS
SELECT
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
GROUP BY f.id
ORDER BY f.avg_rating DESC NULLS LAST, f.tasks_completed DESC;
