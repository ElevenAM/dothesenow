-- Migration 016: Phase 3A code review fixes
-- 1. Add FK from dtn_approval_queue.assigned_reviewer to profiles for PostgREST join
-- 2. Expand review_marketplace_submission return to include reviewer fields

-- =============================================================================
-- 1. Add FK to profiles — enables PostgREST join for reviewer_profile
-- =============================================================================
-- profiles.id references auth.users(id), and assigned_reviewer also references
-- auth.users(id). Adding a direct FK to profiles lets PostgREST traverse the
-- relationship without a manual RPC.

ALTER TABLE dtn_approval_queue
  ADD CONSTRAINT dtn_approval_queue_reviewer_profiles_fkey
  FOREIGN KEY (assigned_reviewer) REFERENCES profiles(id);


-- =============================================================================
-- 2. Expand review_marketplace_submission return type
-- =============================================================================
-- Previously returned only submission_id, task_id, status, freelancer_id.
-- Callers need confirmation of what was saved (reviewer_notes, rating, etc.).

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
    'freelancer_id', v_submission.freelancer_id,
    'reviewer_notes', v_submission.reviewer_notes,
    'ai_review', v_submission.ai_review,
    'rating', v_submission.rating,
    'reviewed_at', v_submission.reviewed_at
  );
END;
$$;

-- Grant stays the same (CREATE OR REPLACE preserves existing grants, but be explicit)
GRANT EXECUTE ON FUNCTION public.review_marketplace_submission(UUID, UUID, TEXT, TEXT, TEXT, INTEGER)
  TO authenticated, service_role;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- 1. Remove FK:
--    ALTER TABLE dtn_approval_queue DROP CONSTRAINT dtn_approval_queue_reviewer_profiles_fkey;
-- 2. Restore original review_marketplace_submission from migration 015
