-- Migration 006: Atomic approval review RPC
-- Phase 5: Automations & Approvals

-- ============================================================
-- review_approval_item() — atomic review with task status sync
-- Updates approval queue + linked daily task in one transaction.
-- SECURITY DEFINER: bypasses RLS, so all WHERE clauses include org_id.
-- ============================================================

CREATE OR REPLACE FUNCTION review_approval_item(
  p_approval_id UUID,
  p_org_id UUID,
  p_reviewer_id UUID,
  p_status TEXT,          -- 'approved', 'rejected', 'revision_requested'
  p_reviewer_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_approval RECORD;
  v_result JSONB;
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

  -- Update linked daily task if exists (also with org_id guard)
  IF v_approval.daily_task_id IS NOT NULL THEN
    IF p_status = 'approved' THEN
      UPDATE dtn_daily_tasks
      SET status = 'completed', completed_at = now()
      WHERE id = v_approval.daily_task_id AND org_id = p_org_id;
    ELSIF p_status = 'revision_requested' THEN
      UPDATE dtn_daily_tasks
      SET status = 'in_progress'
      WHERE id = v_approval.daily_task_id AND org_id = p_org_id;
    ELSIF p_status = 'rejected' THEN
      UPDATE dtn_daily_tasks
      SET status = 'failed'
      WHERE id = v_approval.daily_task_id AND org_id = p_org_id;
    END IF;
  END IF;

  -- Return updated approval item
  SELECT to_jsonb(a) INTO v_result
  FROM dtn_approval_queue a
  WHERE a.id = p_approval_id AND a.org_id = p_org_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Enable realtime on approval queue (REPLICA IDENTITY FULL already set in migration 002)
-- Just ensure it's in the publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'dtn_approval_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dtn_approval_queue;
  END IF;
END $$;
