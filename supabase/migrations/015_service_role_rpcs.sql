-- Migration 015: Service Role RPC Fixes & Atomic Operations
-- Phase [3A] — MCP Server → Shared Queries
--
-- 1. Fix transition_task_status() to work with service_role (no auth.uid())
-- 2. Create review_marketplace_submission() — atomic DEBT-001 fix
-- 3. Create carry_over_tasks_v2() — atomic carry-over with audit trail
-- 4. Create create_strategy_doc_direct() — atomic strategy doc versioning
--    without auth.uid() dependency


-- =============================================================================
-- 1. FIX transition_task_status() FOR SERVICE ROLE
-- =============================================================================
-- The original function calls get_user_org_ids() which requires auth.uid().
-- Service role callers (MCP server, edge functions) have no auth.uid().
-- We add a NULL-safe bypass: service_role is trusted and never exposed to
-- browser clients, so we skip the org membership check for it.

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
  -- Verify caller is a member of the target org.
  -- IS DISTINCT FROM is NULL-safe: if auth.role() is NULL, we still enforce
  -- the check (fail-closed). Service role is already trusted.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF p_org_id NOT IN (SELECT public.get_user_org_ids()) THEN
      RAISE EXCEPTION 'Access denied: not a member of this organization';
    END IF;
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


-- =============================================================================
-- 2. CREATE review_marketplace_submission() — DEBT-001 FIX
-- =============================================================================
-- Atomically: update submission → mark task completed → update freelancer stats.
-- All three writes in one transaction — no partial state possible.

CREATE OR REPLACE FUNCTION public.review_marketplace_submission(
  p_submission_id UUID,
  p_org_id UUID,
  p_status TEXT,
  p_reviewer_notes TEXT DEFAULT NULL,
  p_ai_review TEXT DEFAULT NULL,
  p_rating INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission RECORD;
  v_freelancer RECORD;
  v_new_count INTEGER;
  v_new_avg NUMERIC(3,2);
BEGIN
  -- Auth check: service_role bypass (NULL-safe)
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF p_org_id NOT IN (SELECT public.get_user_org_ids()) THEN
      RAISE EXCEPTION 'Access denied: not a member of this organization';
    END IF;
  END IF;

  -- Validate status
  IF p_status NOT IN ('approved', 'revision_requested', 'rejected') THEN
    RAISE EXCEPTION 'Invalid review status: %. Must be: approved, revision_requested, rejected', p_status;
  END IF;

  -- Validate rating range if provided
  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5, got: %', p_rating;
  END IF;

  -- 1. Update the submission
  UPDATE mktg_task_submissions
  SET
    status = p_status,
    reviewer_notes = COALESCE(p_reviewer_notes, reviewer_notes),
    ai_review = COALESCE(p_ai_review, ai_review),
    rating = COALESCE(p_rating, rating),
    reviewed_at = now()
  WHERE id = p_submission_id AND org_id = p_org_id
  RETURNING * INTO v_submission;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found or does not belong to this organization';
  END IF;

  -- 2. If approved, mark the task as completed
  IF p_status = 'approved' THEN
    UPDATE mktg_tasks
    SET
      status = 'completed',
      completed_at = now(),
      updated_at = now()
    WHERE id = v_submission.task_id AND org_id = p_org_id;
  END IF;

  -- 3. If approved and has a freelancer, update freelancer stats
  IF p_status = 'approved' AND v_submission.freelancer_id IS NOT NULL THEN
    SELECT tasks_completed, avg_rating
    INTO v_freelancer
    FROM mktg_freelancers
    WHERE id = v_submission.freelancer_id AND org_id = p_org_id
    FOR UPDATE;

    IF FOUND THEN
      v_new_count := COALESCE(v_freelancer.tasks_completed, 0) + 1;

      -- Rating calculation with edge cases handled:
      -- First submission: use the rating directly
      -- No rating provided: keep existing avg
      -- Normal case: running average
      IF p_rating IS NOT NULL THEN
        IF v_freelancer.tasks_completed = 0 OR v_freelancer.avg_rating IS NULL THEN
          v_new_avg := p_rating;
        ELSE
          v_new_avg := (v_freelancer.avg_rating * v_freelancer.tasks_completed + p_rating) / v_new_count;
        END IF;
      ELSE
        v_new_avg := v_freelancer.avg_rating;
      END IF;

      UPDATE mktg_freelancers
      SET
        tasks_completed = v_new_count,
        avg_rating = v_new_avg,
        updated_at = now()
      WHERE id = v_submission.freelancer_id AND org_id = p_org_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'submission_id', v_submission.id,
    'task_id', v_submission.task_id,
    'status', p_status,
    'freelancer_id', v_submission.freelancer_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_marketplace_submission(UUID, UUID, TEXT, TEXT, TEXT, INTEGER)
  TO authenticated, service_role;


-- =============================================================================
-- 3. CREATE carry_over_tasks_v2() — ATOMIC CARRY-OVER WITH AUDIT TRAIL
-- =============================================================================
-- Marks incomplete tasks as 'carried_over' and creates pending copies for the
-- target date. Uses transition_task_status() internally for each task to get
-- audit events. All-or-nothing: if any transition fails, entire op rolls back.

CREATE OR REPLACE FUNCTION public.carry_over_tasks_v2(
  p_org_id UUID,
  p_from_date DATE,
  p_to_date DATE DEFAULT CURRENT_DATE,
  p_source TEXT DEFAULT 'mcp',
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_new_id UUID;
  v_new_ids UUID[] := '{}';
  v_count INTEGER := 0;
BEGIN
  -- Auth check: service_role bypass (NULL-safe)
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF p_org_id NOT IN (SELECT public.get_user_org_ids()) THEN
      RAISE EXCEPTION 'Access denied: not a member of this organization';
    END IF;
  END IF;

  -- Lock timeout for the row-level locks inside transition_task_status
  SET LOCAL lock_timeout = '10s';

  -- Loop through incomplete tasks for the source date
  FOR v_task IN
    SELECT *
    FROM dtn_daily_tasks
    WHERE org_id = p_org_id
      AND scheduled_date = p_from_date
      AND status IN ('pending', 'in_progress')
      AND deleted_at IS NULL
    ORDER BY created_at
    FOR UPDATE
  LOOP
    -- Transition via state machine (validates + creates audit event)
    PERFORM public.transition_task_status(
      v_task.id,
      p_org_id,
      'carried_over',
      p_source,
      p_actor_id,
      jsonb_build_object('carried_to_date', p_to_date::TEXT)
    );

    -- Create a pending copy for the target date
    v_new_id := gen_random_uuid();
    INSERT INTO dtn_daily_tasks (
      id, org_id, department_id, created_by, assigned_to,
      title, description, task_type, priority,
      executor_type, executor_config,
      mktg_task_id, status, scheduled_date,
      source_strategy, campaign_id, contact_id,
      generated_by, generation_context
    ) VALUES (
      v_new_id, p_org_id, v_task.department_id, v_task.created_by, v_task.assigned_to,
      v_task.title, v_task.description, v_task.task_type, v_task.priority,
      v_task.executor_type, v_task.executor_config,
      v_task.mktg_task_id, 'pending', p_to_date,
      v_task.source_strategy, v_task.campaign_id, v_task.contact_id,
      v_task.generated_by, v_task.generation_context
    );

    v_new_ids := array_append(v_new_ids, v_new_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'carried_count', v_count,
    'new_task_ids', to_jsonb(v_new_ids),
    'from_date', p_from_date,
    'to_date', p_to_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.carry_over_tasks_v2(UUID, DATE, DATE, TEXT, UUID)
  TO authenticated, service_role;


-- =============================================================================
-- 4. CREATE create_strategy_doc_direct() — ATOMIC VERSIONING WITHOUT auth.uid()
-- =============================================================================
-- Same logic as update_strategy_doc() but uses p_org_id for auth check instead
-- of auth.uid(). This makes it usable from service_role callers (MCP, edge fns).
-- Uses FOR UPDATE lock to prevent concurrent version conflicts.

CREATE OR REPLACE FUNCTION public.create_strategy_doc_direct(
  p_org_id UUID,
  p_doc_type TEXT,
  p_title TEXT,
  p_content TEXT,
  p_change_summary TEXT DEFAULT NULL,
  p_changed_by TEXT DEFAULT 'claude',
  p_tags TEXT[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_id UUID;
  v_current_version INT;
  v_new_id UUID;
BEGIN
  -- Auth check: service_role bypass (NULL-safe)
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF p_org_id NOT IN (SELECT public.get_user_org_ids()) THEN
      RAISE EXCEPTION 'Access denied: not a member of this organization';
    END IF;
  END IF;

  SET LOCAL lock_timeout = '5s';

  -- Lock and fetch current active doc for this type
  SELECT id, version INTO v_current_id, v_current_version
  FROM mktg_strategy_docs
  WHERE org_id = p_org_id
    AND doc_type = p_doc_type
    AND is_active = true
    AND deleted_at IS NULL
  FOR UPDATE;

  -- Deactivate current version (if exists)
  IF v_current_id IS NOT NULL THEN
    UPDATE mktg_strategy_docs
    SET is_active = false
    WHERE id = v_current_id;
  END IF;

  -- Insert new version
  v_new_id := gen_random_uuid();
  INSERT INTO mktg_strategy_docs (
    id, org_id, doc_type, title, content, version,
    previous_version_id, change_summary, changed_by, tags, is_active
  ) VALUES (
    v_new_id, p_org_id, p_doc_type, p_title, p_content,
    COALESCE(v_current_version, 0) + 1,
    v_current_id, p_change_summary, p_changed_by, p_tags, true
  );

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_strategy_doc_direct(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[])
  TO authenticated, service_role;


-- =============================================================================
-- ROLLBACK INSTRUCTIONS
-- =============================================================================
-- To rollback this migration:
--
-- 1. Drop new functions:
--    DROP FUNCTION IF EXISTS public.review_marketplace_submission(UUID, UUID, TEXT, TEXT, TEXT, INTEGER);
--    DROP FUNCTION IF EXISTS public.carry_over_tasks_v2(UUID, DATE, DATE, TEXT, UUID);
--    DROP FUNCTION IF EXISTS public.create_strategy_doc_direct(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]);
--
-- 2. Restore original transition_task_status (from migration 013):
--    -- Re-run the CREATE OR REPLACE from 013 to remove the service_role bypass
