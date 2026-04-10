-- Migration: Allow reopening completed tasks (completed -> pending)
--
-- The UI checkbox lets users uncheck a completed task to reopen it.
-- Previously `completed` was terminal, forcing a raw UPDATE that bypassed
-- the audit event log. This migration adds the transition so
-- `transition_task_status()` handles it properly with full audit trail.

CREATE OR REPLACE FUNCTION public.transition_task_status(
  p_task_id UUID,
  p_new_status TEXT,
  p_source TEXT DEFAULT 'system',
  p_actor_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status TEXT;
  v_org_id UUID;
  v_allowed TEXT[];
BEGIN
  -- Lock the row to prevent concurrent transitions
  SELECT status, org_id INTO v_current_status, v_org_id
  FROM dtn_daily_tasks
  WHERE id = p_task_id
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
    WHEN 'completed'         THEN ARRAY['pending']  -- allow reopening
    ELSE ARRAY[]::TEXT[]  -- skipped, carried_over are terminal
  END;

  IF NOT p_new_status = ANY(v_allowed) THEN
    RAISE EXCEPTION 'Invalid transition: % -> %. Allowed from %: %',
      v_current_status, p_new_status, v_current_status, array_to_string(v_allowed, ', ');
  END IF;

  -- Perform the status update
  UPDATE dtn_daily_tasks
  SET
    status = p_new_status,
    completed_at = CASE
      WHEN p_new_status = 'completed' THEN now()
      WHEN p_new_status = 'pending' THEN NULL  -- clear completed_at on reopen
      ELSE completed_at
    END,
    updated_at = now()
  WHERE id = p_task_id;

  -- Record the event
  INSERT INTO dtn_task_events (
    task_id, org_id, event_type, source, actor_id,
    previous_state, new_state, metadata
  ) VALUES (
    p_task_id, v_org_id, 'status_change', p_source, p_actor_id,
    jsonb_build_object('status', v_current_status),
    jsonb_build_object('status', p_new_status),
    p_metadata
  );

  RETURN v_current_status;
END;
$$;

-- Also update the 6-arg version (with p_org_id) from migration 015
CREATE OR REPLACE FUNCTION public.transition_task_status(
  p_task_id UUID,
  p_org_id UUID,
  p_new_status TEXT,
  p_source TEXT DEFAULT 'system',
  p_actor_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status TEXT;
  v_allowed TEXT[];
  v_event_id UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF p_org_id NOT IN (SELECT public.get_user_org_ids()) THEN
      RAISE EXCEPTION 'Access denied: not a member of this organization';
    END IF;
  END IF;

  IF p_source NOT IN ('web_ui', 'slack_bot', 'mcp', 'cron', 'agent', 'api') THEN
    RAISE EXCEPTION 'Invalid source: %. Must be one of: web_ui, slack_bot, mcp, cron, agent, api', p_source;
  END IF;

  SET LOCAL lock_timeout = '5s';

  SELECT status INTO v_current_status
  FROM dtn_daily_tasks
  WHERE id = p_task_id AND org_id = p_org_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found, deleted, or does not belong to this organization';
  END IF;

  v_allowed := CASE v_current_status
    WHEN 'pending'           THEN ARRAY['in_progress', 'waiting_approval', 'skipped', 'carried_over']
    WHEN 'in_progress'       THEN ARRAY['completed', 'failed', 'blocked', 'skipped', 'waiting_approval']
    WHEN 'waiting_approval'  THEN ARRAY['in_progress', 'skipped', 'failed']
    WHEN 'blocked'           THEN ARRAY['in_progress', 'skipped', 'carried_over']
    WHEN 'failed'            THEN ARRAY['in_progress', 'carried_over']
    WHEN 'completed'         THEN ARRAY['pending']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT p_new_status = ANY(v_allowed) THEN
    RAISE EXCEPTION 'Invalid transition: % -> %. Allowed from %: %',
      v_current_status, p_new_status, v_current_status, array_to_string(v_allowed, ', ');
  END IF;

  UPDATE dtn_daily_tasks
  SET
    status = p_new_status,
    completed_at = CASE
      WHEN p_new_status = 'completed' THEN now()
      WHEN p_new_status = 'pending' THEN NULL
      ELSE completed_at
    END,
    updated_at = now()
  WHERE id = p_task_id;

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
