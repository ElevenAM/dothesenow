-- Migration: Fix approval RPC bypass and state machine gap
--
-- Findings #11, #16: review_approval_item() directly UPDATEs dtn_daily_tasks.status,
-- bypassing transition_task_status() — no audit trail, no state machine validation.
--
-- Changes:
--   1. Add waiting_approval → completed to both transition_task_status() overloads
--   2. Replace review_approval_item() to use transition_task_status() instead of
--      direct UPDATEs, producing audit entries in dtn_task_events
--   3. Add p_source parameter so callers can distinguish web_ui vs mcp origin

-- ============================================================
-- 1a. Update 5-arg transition_task_status (simple version)
-- ============================================================
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
  SELECT status, org_id INTO v_current_status, v_org_id
  FROM dtn_daily_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found, deleted, or does not belong to this organization';
  END IF;

  v_allowed := CASE v_current_status
    WHEN 'pending'           THEN ARRAY['in_progress', 'waiting_approval', 'skipped', 'carried_over']
    WHEN 'in_progress'       THEN ARRAY['completed', 'failed', 'blocked', 'skipped', 'waiting_approval']
    WHEN 'waiting_approval'  THEN ARRAY['in_progress', 'completed', 'skipped', 'failed']
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
    task_id, org_id, event_type, source, actor_id,
    previous_state, new_state, metadata
  ) VALUES (
    p_task_id, v_org_id, 'status_changed', p_source, p_actor_id,
    jsonb_build_object('status', v_current_status),
    jsonb_build_object('status', p_new_status),
    p_metadata
  );

  RETURN v_current_status;
END;
$$;

-- ============================================================
-- 1b. Update 6-arg transition_task_status (org-scoped version)
-- ============================================================
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
    WHEN 'waiting_approval'  THEN ARRAY['in_progress', 'completed', 'skipped', 'failed']
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

-- ============================================================
-- 2. Replace review_approval_item() to use transition_task_status()
--    Adds p_source parameter for audit trail origin context.
--    Drop the old 5-arg overload first so callers always hit the new version.
-- ============================================================
DROP FUNCTION IF EXISTS review_approval_item(UUID, UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION review_approval_item(
  p_approval_id UUID,
  p_org_id UUID,
  p_reviewer_id UUID,
  p_status TEXT,
  p_reviewer_notes TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'api'
) RETURNS JSONB AS $$
DECLARE
  v_approval RECORD;
  v_result JSONB;
  v_new_task_status TEXT;
BEGIN
  -- Validate status parameter
  IF p_status NOT IN ('approved', 'rejected', 'revision_requested') THEN
    RAISE EXCEPTION 'Invalid review status: %. Must be approved, rejected, or revision_requested', p_status;
  END IF;

  -- Lock the approval row (explicit org_id guard since SECURITY DEFINER bypasses RLS)
  SELECT * INTO v_approval
  FROM dtn_approval_queue
  WHERE id = p_approval_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval item not found or does not belong to this organization';
  END IF;

  -- Validate status transition: only pending or revision_requested items can be reviewed
  IF v_approval.status NOT IN ('pending', 'revision_requested') THEN
    RAISE EXCEPTION 'Cannot review item with status: %. Only pending or revision_requested items can be reviewed.', v_approval.status;
  END IF;

  -- Update approval queue
  UPDATE dtn_approval_queue
  SET status = p_status,
      reviewer_notes = p_reviewer_notes,
      reviewed_at = now(),
      assigned_reviewer = p_reviewer_id
  WHERE id = p_approval_id AND org_id = p_org_id;

  -- Transition linked daily task via state machine (produces audit trail)
  IF v_approval.daily_task_id IS NOT NULL THEN
    v_new_task_status := CASE p_status
      WHEN 'approved'           THEN 'completed'
      WHEN 'revision_requested' THEN 'in_progress'
      WHEN 'rejected'           THEN 'failed'
    END;

    PERFORM transition_task_status(
      v_approval.daily_task_id,
      p_org_id,
      v_new_task_status,
      p_source,
      p_reviewer_id,
      jsonb_build_object('approval_id', p_approval_id, 'review_status', p_status)
    );
  END IF;

  -- Return updated approval item
  SELECT to_jsonb(a) INTO v_result
  FROM dtn_approval_queue a
  WHERE a.id = p_approval_id AND a.org_id = p_org_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
