-- Migration 013: Task Event Log & State Machine
-- Phase [2A] — Database Schema Hardening
--
-- Creates dtn_task_events table for audit trail of task status changes.
-- Adds transition_task_status() function implementing a state machine
-- with validated transitions, caller authorization, and event logging.
--
-- Also adds 'blocked' to the dtn_daily_tasks status CHECK constraint
-- (was missing from the original schema).
--
-- NOTE: Existing app code (updateDailyTask, MCP update_daily_task,
-- carry_over_tasks, review_approval_item) still does direct UPDATE on
-- dtn_daily_tasks.status. These callers will be migrated to use
-- transition_task_status() in Phase 3 ([3A] and [3B]). Until then,
-- the event log only captures transitions made via this function.

-- =============================================================================
-- 1. FIX STATUS CHECK CONSTRAINT — ADD 'blocked'
-- =============================================================================

ALTER TABLE dtn_daily_tasks DROP CONSTRAINT dtn_daily_tasks_status_check;
ALTER TABLE dtn_daily_tasks ADD CONSTRAINT dtn_daily_tasks_status_check
  CHECK (status IN (
    'pending', 'in_progress', 'waiting_approval', 'completed',
    'skipped', 'failed', 'carried_over', 'blocked'
  ));


-- =============================================================================
-- 2. CREATE TASK EVENTS TABLE
-- =============================================================================

CREATE TABLE dtn_task_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES dtn_daily_tasks(id),
  org_id UUID NOT NULL REFERENCES dtn_organizations(id),
  event_type TEXT NOT NULL,                    -- 'status_changed', 'assigned', 'note_added', etc.
  previous_state JSONB,                        -- e.g. {"status": "pending"}
  new_state JSONB,                             -- e.g. {"status": "in_progress"}
  source TEXT NOT NULL,                        -- web_ui, slack_bot, mcp, cron, agent, api
  actor_id UUID,                               -- auth.users id of who triggered
  metadata JSONB DEFAULT '{}',                 -- additional context
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_task_events_task ON dtn_task_events(task_id, created_at);
CREATE INDEX idx_task_events_org ON dtn_task_events(org_id, created_at);

-- Enable RLS
ALTER TABLE dtn_task_events ENABLE ROW LEVEL SECURITY;

-- Service role: full access (needed for edge functions, cron jobs)
CREATE POLICY "Service role full access"
  ON dtn_task_events FOR ALL
  USING (auth.role() = 'service_role');

-- Org members: read-only access to events in their orgs
CREATE POLICY "Members read task events"
  ON dtn_task_events FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND org_id IN (SELECT public.get_user_org_ids())
  );

-- NOTE: No INSERT/UPDATE/DELETE policies for authenticated role.
-- Events are created exclusively via transition_task_status() which runs
-- as SECURITY DEFINER, bypassing RLS. This ensures events can only be
-- created through validated state transitions.


-- =============================================================================
-- 3. CREATE STATE MACHINE FUNCTION
-- =============================================================================
--
-- State transition map (complete):
--
--   pending           -> in_progress, waiting_approval, skipped, carried_over
--   in_progress       -> completed, failed, blocked, skipped, waiting_approval
--   waiting_approval  -> in_progress (approved), skipped (rejected), failed
--   blocked           -> in_progress, skipped, carried_over
--   failed            -> in_progress, carried_over
--   completed         -> (terminal)
--   skipped           -> (terminal)
--   carried_over      -> (terminal)

CREATE OR REPLACE FUNCTION public.transition_task_status(
  p_task_id UUID,
  p_org_id UUID,
  p_new_status TEXT,
  p_source TEXT,
  p_actor_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status TEXT;
  v_allowed TEXT[];
  v_event_id UUID;
BEGIN
  -- Verify caller is a member of the target org
  IF p_org_id NOT IN (SELECT public.get_user_org_ids()) THEN
    RAISE EXCEPTION 'Access denied: not a member of this organization';
  END IF;

  -- Validate source
  IF p_source NOT IN ('web_ui', 'slack_bot', 'mcp', 'cron', 'agent', 'api') THEN
    RAISE EXCEPTION 'Invalid source: %. Must be one of: web_ui, slack_bot, mcp, cron, agent, api', p_source;
  END IF;

  -- Lock the task row with timeout to prevent indefinite blocking
  SET LOCAL lock_timeout = '5s';

  SELECT status INTO v_current_status
  FROM dtn_daily_tasks
  WHERE id = p_task_id AND org_id = p_org_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found, deleted, or does not belong to this organization';
  END IF;

  -- Define legal transitions
  v_allowed := CASE v_current_status
    WHEN 'pending'           THEN ARRAY['in_progress', 'waiting_approval', 'skipped', 'carried_over']
    WHEN 'in_progress'       THEN ARRAY['completed', 'failed', 'blocked', 'skipped', 'waiting_approval']
    WHEN 'waiting_approval'  THEN ARRAY['in_progress', 'skipped', 'failed']
    WHEN 'blocked'           THEN ARRAY['in_progress', 'skipped', 'carried_over']
    WHEN 'failed'            THEN ARRAY['in_progress', 'carried_over']
    ELSE ARRAY[]::TEXT[]  -- completed, skipped, carried_over are terminal
  END;

  IF NOT p_new_status = ANY(v_allowed) THEN
    RAISE EXCEPTION 'Invalid transition: % -> %. Allowed from %: %',
      v_current_status, p_new_status, v_current_status, array_to_string(v_allowed, ', ');
  END IF;

  -- Perform the status update
  UPDATE dtn_daily_tasks
  SET
    status = p_new_status,
    completed_at = CASE WHEN p_new_status = 'completed' THEN now() ELSE completed_at END,
    updated_at = now()
  WHERE id = p_task_id;

  -- Record the event
  INSERT INTO dtn_task_events (
    task_id, org_id, event_type, previous_state, new_state,
    source, actor_id, metadata
  ) VALUES (
    p_task_id, p_org_id, 'status_changed',
    jsonb_build_object('status', v_current_status),
    jsonb_build_object('status', p_new_status),
    p_source, p_actor_id, p_metadata
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- Grant execute to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.transition_task_status(UUID, UUID, TEXT, TEXT, UUID, JSONB)
  TO authenticated, service_role;


-- =============================================================================
-- ROLLBACK INSTRUCTIONS
-- =============================================================================
-- To rollback this migration:
--
-- 1. Drop the function:
--    DROP FUNCTION IF EXISTS public.transition_task_status(UUID, UUID, TEXT, TEXT, UUID, JSONB);
--
-- 2. Drop the events table:
--    DROP TABLE IF EXISTS dtn_task_events;
--
-- 3. Restore the original CHECK constraint (without 'blocked'):
--    ALTER TABLE dtn_daily_tasks DROP CONSTRAINT dtn_daily_tasks_status_check;
--    ALTER TABLE dtn_daily_tasks ADD CONSTRAINT dtn_daily_tasks_status_check
--      CHECK (status IN ('pending', 'in_progress', 'waiting_approval',
--                        'completed', 'skipped', 'failed', 'carried_over'));
