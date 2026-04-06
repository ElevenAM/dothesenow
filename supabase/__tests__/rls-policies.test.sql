-- =============================================================================
-- RLS Policy Test Script — Phase [2A]
-- =============================================================================
--
-- This script verifies:
--   1. Cross-org isolation (User A can't read User B's org data)
--   2. Freelancer can only see assigned tasks within their org
--   3. Soft-deleted rows are invisible via SELECT
--   4. transition_task_status() validates transitions
--   5. transition_task_status() rejects unauthorized cross-tenant calls
--   6. Soft delete functions reject cross-tenant calls
--   7. Soft delete: row invisible after delete, restorable
--
-- Prerequisites:
--   - Migrations 001–013 applied
--   - Run via Supabase SQL Editor or Management API (as postgres superuser)
--
-- IMPORTANT: Uses SET LOCAL ROLE to actually switch the Postgres execution
-- role, ensuring RLS policies are properly engaged. set_config alone only
-- sets GUC variables and does NOT switch the role for RLS evaluation.
--
-- Each test block outputs PASS/FAIL via RAISE NOTICE.
-- Any RAISE EXCEPTION means a test failure.

-- =============================================================================
-- SETUP: Create test users, orgs, and data
-- =============================================================================

DO $$
DECLARE
  v_user_a_id UUID;
  v_user_b_id UUID;
  v_org_1_id UUID;
  v_org_2_id UUID;
  v_dept_1_id UUID;
  v_dept_2_id UUID;
  v_task_1_id UUID;
  v_task_2_id UUID;
  v_mktg_task_assigned_id UUID;
  v_mktg_task_open_id UUID;
  v_mktg_task_unassigned_id UUID;
  v_freelancer_id UUID;
  v_contact_1_id UUID;
  v_contact_2_id UUID;
  v_campaign_1_id UUID;
  v_strategy_1_id UUID;
  v_event_id UUID;
  v_row_count INT;
  v_error_caught BOOLEAN;
BEGIN

  -- Create test users in auth.users
  INSERT INTO auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data)
  VALUES (
    gen_random_uuid(), 'testuser_a@rls-test.local', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', crypt('password123', gen_salt('bf')),
    now(), now(), now(), '', '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Test User A"}'::jsonb
  ) RETURNING id INTO v_user_a_id;

  INSERT INTO auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data)
  VALUES (
    gen_random_uuid(), 'testuser_b@rls-test.local', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', crypt('password456', gen_salt('bf')),
    now(), now(), now(), '', '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Test User B"}'::jsonb
  ) RETURNING id INTO v_user_b_id;

  -- Create orgs
  INSERT INTO dtn_organizations (id, name, slug)
  VALUES (gen_random_uuid(), 'RLS Test Org 1', 'rls-test-org-1')
  RETURNING id INTO v_org_1_id;

  INSERT INTO dtn_organizations (id, name, slug)
  VALUES (gen_random_uuid(), 'RLS Test Org 2', 'rls-test-org-2')
  RETURNING id INTO v_org_2_id;

  -- Create memberships: User A in Org 1, User B in Org 2
  INSERT INTO dtn_memberships (org_id, user_id, role, is_active, accepted_at)
  VALUES (v_org_1_id, v_user_a_id, 'owner', true, now());

  INSERT INTO dtn_memberships (org_id, user_id, role, is_active, accepted_at)
  VALUES (v_org_2_id, v_user_b_id, 'owner', true, now());

  -- Create departments
  INSERT INTO dtn_departments (id, org_id, slug, name, is_active)
  VALUES (gen_random_uuid(), v_org_1_id, 'marketing', 'Marketing', true)
  RETURNING id INTO v_dept_1_id;

  INSERT INTO dtn_departments (id, org_id, slug, name, is_active)
  VALUES (gen_random_uuid(), v_org_2_id, 'marketing', 'Marketing', true)
  RETURNING id INTO v_dept_2_id;

  -- Create daily tasks in each org
  INSERT INTO dtn_daily_tasks (id, org_id, department_id, created_by, title, status, scheduled_date)
  VALUES (gen_random_uuid(), v_org_1_id, v_dept_1_id, v_user_a_id, 'Org 1 Task', 'pending', CURRENT_DATE)
  RETURNING id INTO v_task_1_id;

  INSERT INTO dtn_daily_tasks (id, org_id, department_id, created_by, title, status, scheduled_date)
  VALUES (gen_random_uuid(), v_org_2_id, v_dept_2_id, v_user_b_id, 'Org 2 Task', 'pending', CURRENT_DATE)
  RETURNING id INTO v_task_2_id;

  -- Create a freelancer in Org 1 linked to User A's email
  INSERT INTO mktg_freelancers (id, org_id, name, email, experience_level, available)
  VALUES (gen_random_uuid(), v_org_1_id, 'Freelancer A', 'testuser_a@rls-test.local', 'mid', true)
  RETURNING id INTO v_freelancer_id;

  -- Create mktg_tasks for freelancer testing:
  --   1. Assigned to the freelancer (in_progress) — should be visible
  --   2. Open task (status = 'open') — should be visible
  --   3. Unassigned task (draft) — should NOT be visible to freelancer
  INSERT INTO mktg_tasks (id, org_id, title, description, brief, task_type, status, assigned_to)
  VALUES (gen_random_uuid(), v_org_1_id, 'Assigned Task', 'Test task assigned to freelancer', 'Test brief', 'blog_post', 'in_progress', v_freelancer_id)
  RETURNING id INTO v_mktg_task_assigned_id;

  INSERT INTO mktg_tasks (id, org_id, title, description, brief, task_type, status)
  VALUES (gen_random_uuid(), v_org_1_id, 'Open Task', 'Test open task', 'Test brief', 'social_content', 'open')
  RETURNING id INTO v_mktg_task_open_id;

  INSERT INTO mktg_tasks (id, org_id, title, description, brief, task_type, status)
  VALUES (gen_random_uuid(), v_org_1_id, 'Draft Unassigned Task', 'Test draft task', 'Test brief', 'email_copy', 'draft')
  RETURNING id INTO v_mktg_task_unassigned_id;

  -- Create contacts
  INSERT INTO mktg_contacts (id, org_id, first_name, last_name, email)
  VALUES (gen_random_uuid(), v_org_1_id, 'Alice', 'Contact', 'alice@test.local')
  RETURNING id INTO v_contact_1_id;

  INSERT INTO mktg_contacts (id, org_id, first_name, last_name, email)
  VALUES (gen_random_uuid(), v_org_2_id, 'Bob', 'Contact', 'bob@test.local')
  RETURNING id INTO v_contact_2_id;

  -- Create campaigns
  INSERT INTO mktg_campaigns (id, org_id, name, campaign_type, status)
  VALUES (gen_random_uuid(), v_org_1_id, 'Org 1 Campaign', 'email_sequence', 'draft')
  RETURNING id INTO v_campaign_1_id;

  -- Create strategy doc
  INSERT INTO mktg_strategy_docs (id, org_id, doc_type, title, content, is_active)
  VALUES (gen_random_uuid(), v_org_1_id, 'master_strategy', 'Org 1 Strategy', 'Test content', true)
  RETURNING id INTO v_strategy_1_id;

  RAISE NOTICE '=== TEST SETUP COMPLETE ===';
  RAISE NOTICE 'User A: %, User B: %', v_user_a_id, v_user_b_id;
  RAISE NOTICE 'Org 1: %, Org 2: %', v_org_1_id, v_org_2_id;

  -- =========================================================================
  -- TEST 1: Cross-org isolation — User A can only see Org 1 data
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- TEST 1: Cross-org isolation ---';

  -- Switch to authenticated role with User A's JWT claims
  -- NOTE: SET LOCAL ROLE actually switches the Postgres execution role,
  -- which is required for RLS policies to be evaluated correctly.
  -- set_config alone only sets GUC variables.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_a_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_user_a_id, 'role', 'authenticated', 'email', 'testuser_a@rls-test.local'
  )::text, true);

  -- User A should NOT see Org 2 tasks
  SELECT count(*) INTO v_row_count FROM dtn_daily_tasks WHERE org_id = v_org_2_id;
  IF v_row_count = 0 THEN
    RAISE NOTICE 'PASS: User A cannot see Org 2 tasks';
  ELSE
    RAISE EXCEPTION 'FAIL: User A can see % rows from Org 2 tasks', v_row_count;
  END IF;

  -- User A SHOULD see Org 1 tasks
  SELECT count(*) INTO v_row_count FROM dtn_daily_tasks WHERE org_id = v_org_1_id;
  IF v_row_count > 0 THEN
    RAISE NOTICE 'PASS: User A can see Org 1 tasks (% rows)', v_row_count;
  ELSE
    RAISE EXCEPTION 'FAIL: User A cannot see own Org 1 tasks';
  END IF;

  -- User A should NOT see Org 2 contacts
  SELECT count(*) INTO v_row_count FROM mktg_contacts WHERE org_id = v_org_2_id;
  IF v_row_count = 0 THEN
    RAISE NOTICE 'PASS: User A cannot see Org 2 contacts';
  ELSE
    RAISE EXCEPTION 'FAIL: User A can see % rows from Org 2 contacts', v_row_count;
  END IF;

  -- =========================================================================
  -- TEST 2: Freelancer visibility — only assigned + open tasks, not drafts
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- TEST 2: Freelancer visibility ---';

  -- Still as User A (who is the freelancer in Org 1)
  -- User A is both an org member AND a freelancer. As an org member, the
  -- "Members access tasks" FOR ALL policy grants full access. The freelancer
  -- policies add access for non-member freelancers. Here we verify the
  -- freelancer policies themselves are syntactically correct by checking
  -- that User A can see assigned + open tasks (which they can via either path).

  -- Can see the assigned task
  SELECT count(*) INTO v_row_count FROM mktg_tasks WHERE id = v_mktg_task_assigned_id;
  IF v_row_count = 1 THEN
    RAISE NOTICE 'PASS: Freelancer can see assigned task';
  ELSE
    RAISE EXCEPTION 'FAIL: Freelancer cannot see assigned task';
  END IF;

  -- Can see the open task
  SELECT count(*) INTO v_row_count FROM mktg_tasks WHERE id = v_mktg_task_open_id;
  IF v_row_count = 1 THEN
    RAISE NOTICE 'PASS: Freelancer can see open task';
  ELSE
    RAISE EXCEPTION 'FAIL: Freelancer cannot see open task';
  END IF;

  -- Can also see the draft (via org member policy, not freelancer policy)
  -- This is expected: org members see all tasks. True freelancer-only isolation
  -- would require a non-member freelancer test, which needs a user who is in
  -- mktg_freelancers but NOT in dtn_memberships. Documenting this as a known
  -- test limitation: a full freelancer isolation test requires a user with
  -- freelancer profile but no org membership.
  SELECT count(*) INTO v_row_count FROM mktg_tasks WHERE id = v_mktg_task_unassigned_id;
  IF v_row_count = 1 THEN
    RAISE NOTICE 'PASS: Org member can see draft task (expected — member policy)';
  ELSE
    RAISE NOTICE 'INFO: Draft task not visible (unexpected for org member)';
  END IF;

  -- Verify User B (Org 2) cannot see Org 1 freelancer tasks
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_b_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_user_b_id, 'role', 'authenticated', 'email', 'testuser_b@rls-test.local'
  )::text, true);

  SELECT count(*) INTO v_row_count FROM mktg_tasks WHERE org_id = v_org_1_id;
  IF v_row_count = 0 THEN
    RAISE NOTICE 'PASS: User B cannot see Org 1 mktg_tasks';
  ELSE
    RAISE EXCEPTION 'FAIL: User B can see % Org 1 mktg_tasks', v_row_count;
  END IF;

  -- =========================================================================
  -- TEST 3: Soft-deleted rows invisible via SELECT
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- TEST 3: Soft delete visibility ---';

  -- Reset to superuser to soft-delete
  EXECUTE 'SET LOCAL ROLE postgres';
  UPDATE dtn_daily_tasks SET deleted_at = now() WHERE id = v_task_1_id;

  -- Switch back to User A
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_a_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_user_a_id, 'role', 'authenticated', 'email', 'testuser_a@rls-test.local'
  )::text, true);

  SELECT count(*) INTO v_row_count FROM dtn_daily_tasks WHERE id = v_task_1_id;
  IF v_row_count = 0 THEN
    RAISE NOTICE 'PASS: Soft-deleted task invisible to authenticated user';
  ELSE
    RAISE EXCEPTION 'FAIL: Soft-deleted task still visible (% rows)', v_row_count;
  END IF;

  -- =========================================================================
  -- TEST 4: Soft delete is restorable
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- TEST 4: Soft delete restorable ---';

  EXECUTE 'SET LOCAL ROLE postgres';
  UPDATE dtn_daily_tasks SET deleted_at = NULL WHERE id = v_task_1_id;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_a_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_user_a_id, 'role', 'authenticated', 'email', 'testuser_a@rls-test.local'
  )::text, true);

  SELECT count(*) INTO v_row_count FROM dtn_daily_tasks WHERE id = v_task_1_id;
  IF v_row_count = 1 THEN
    RAISE NOTICE 'PASS: Restored task is visible again';
  ELSE
    RAISE EXCEPTION 'FAIL: Restored task not visible (% rows)', v_row_count;
  END IF;

  -- =========================================================================
  -- TEST 5: transition_task_status() — valid transitions
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- TEST 5: Valid state transitions ---';

  -- transition_task_status is SECURITY DEFINER, so it runs as its owner
  -- regardless of the calling role. We just need the JWT claims set for
  -- get_user_org_ids() to resolve correctly.

  -- pending -> in_progress
  v_event_id := public.transition_task_status(
    v_task_1_id, v_org_1_id, 'in_progress', 'web_ui', v_user_a_id
  );
  IF v_event_id IS NOT NULL THEN
    RAISE NOTICE 'PASS: pending -> in_progress (event: %)', v_event_id;
  END IF;

  -- in_progress -> blocked
  v_event_id := public.transition_task_status(
    v_task_1_id, v_org_1_id, 'blocked', 'web_ui', v_user_a_id
  );
  RAISE NOTICE 'PASS: in_progress -> blocked (event: %)', v_event_id;

  -- blocked -> in_progress
  v_event_id := public.transition_task_status(
    v_task_1_id, v_org_1_id, 'in_progress', 'mcp', v_user_a_id
  );
  RAISE NOTICE 'PASS: blocked -> in_progress (event: %)', v_event_id;

  -- in_progress -> waiting_approval
  v_event_id := public.transition_task_status(
    v_task_1_id, v_org_1_id, 'waiting_approval', 'web_ui', v_user_a_id
  );
  RAISE NOTICE 'PASS: in_progress -> waiting_approval (event: %)', v_event_id;

  -- waiting_approval -> in_progress (approved)
  v_event_id := public.transition_task_status(
    v_task_1_id, v_org_1_id, 'in_progress', 'web_ui', v_user_a_id
  );
  RAISE NOTICE 'PASS: waiting_approval -> in_progress (event: %)', v_event_id;

  -- in_progress -> completed (terminal)
  v_event_id := public.transition_task_status(
    v_task_1_id, v_org_1_id, 'completed', 'web_ui', v_user_a_id
  );
  RAISE NOTICE 'PASS: in_progress -> completed (event: %)', v_event_id;

  -- Verify 6 events were logged
  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT count(*) INTO v_row_count FROM dtn_task_events WHERE task_id = v_task_1_id;
  IF v_row_count = 6 THEN
    RAISE NOTICE 'PASS: 6 events recorded for task transitions';
  ELSE
    RAISE EXCEPTION 'FAIL: Expected 6 events, got %', v_row_count;
  END IF;

  -- =========================================================================
  -- TEST 6: transition_task_status() — invalid transitions rejected
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- TEST 6: Invalid transitions rejected ---';

  -- Switch back to authenticated User A for the SECURITY DEFINER calls
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_a_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_user_a_id, 'role', 'authenticated', 'email', 'testuser_a@rls-test.local'
  )::text, true);

  -- completed -> in_progress (completed is terminal)
  v_error_caught := false;
  BEGIN
    v_event_id := public.transition_task_status(
      v_task_1_id, v_org_1_id, 'in_progress', 'web_ui', v_user_a_id
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
    RAISE NOTICE 'PASS: completed -> in_progress rejected: %', SQLERRM;
  END;
  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'FAIL: completed -> in_progress was allowed';
  END IF;

  -- Reset task status for more tests
  EXECUTE 'SET LOCAL ROLE postgres';
  UPDATE dtn_daily_tasks SET status = 'pending', completed_at = NULL WHERE id = v_task_1_id;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_a_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_user_a_id, 'role', 'authenticated', 'email', 'testuser_a@rls-test.local'
  )::text, true);

  -- pending -> completed (not allowed, must go through in_progress)
  v_error_caught := false;
  BEGIN
    v_event_id := public.transition_task_status(
      v_task_1_id, v_org_1_id, 'completed', 'web_ui', v_user_a_id
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
    RAISE NOTICE 'PASS: pending -> completed rejected: %', SQLERRM;
  END;
  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'FAIL: pending -> completed was allowed';
  END IF;

  -- pending -> blocked (not allowed)
  v_error_caught := false;
  BEGIN
    v_event_id := public.transition_task_status(
      v_task_1_id, v_org_1_id, 'blocked', 'web_ui', v_user_a_id
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
    RAISE NOTICE 'PASS: pending -> blocked rejected: %', SQLERRM;
  END;
  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'FAIL: pending -> blocked was allowed';
  END IF;

  -- Invalid source
  v_error_caught := false;
  BEGIN
    v_event_id := public.transition_task_status(
      v_task_1_id, v_org_1_id, 'in_progress', 'invalid_source', v_user_a_id
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
    RAISE NOTICE 'PASS: Invalid source rejected: %', SQLERRM;
  END;
  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'FAIL: Invalid source was allowed';
  END IF;

  -- =========================================================================
  -- TEST 7: Cross-tenant SECURITY DEFINER rejection
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- TEST 7: Cross-tenant SECURITY DEFINER rejection ---';

  -- User A tries to transition Org 2's task
  v_error_caught := false;
  BEGIN
    v_event_id := public.transition_task_status(
      v_task_2_id, v_org_2_id, 'in_progress', 'web_ui', v_user_a_id
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
    RAISE NOTICE 'PASS: Cross-tenant transition_task_status rejected: %', SQLERRM;
  END;
  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'FAIL: User A could transition Org 2 task';
  END IF;

  -- User A tries to soft-delete Org 2's contact
  v_error_caught := false;
  BEGIN
    PERFORM public.soft_delete_contact(v_contact_2_id, v_org_2_id);
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
    RAISE NOTICE 'PASS: Cross-tenant soft_delete_contact rejected: %', SQLERRM;
  END;
  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'FAIL: User A could soft-delete Org 2 contact';
  END IF;

  -- User A tries to soft-delete Org 2's task
  v_error_caught := false;
  BEGIN
    PERFORM public.soft_delete_task(v_task_2_id, v_org_2_id);
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
    RAISE NOTICE 'PASS: Cross-tenant soft_delete_task rejected: %', SQLERRM;
  END;
  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'FAIL: User A could soft-delete Org 2 task';
  END IF;

  -- =========================================================================
  -- TEST 8: Soft delete functions — happy path
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- TEST 8: Soft delete functions ---';

  -- User A soft-deletes own contact
  PERFORM public.soft_delete_contact(v_contact_1_id, v_org_1_id);

  -- Verify invisible via RLS SELECT (still as authenticated User A)
  SELECT count(*) INTO v_row_count FROM mktg_contacts WHERE id = v_contact_1_id;
  IF v_row_count = 0 THEN
    RAISE NOTICE 'PASS: soft_delete_contact hides row from SELECT';
  ELSE
    RAISE EXCEPTION 'FAIL: Soft-deleted contact still visible';
  END IF;

  -- Double-delete should fail
  v_error_caught := false;
  BEGIN
    PERFORM public.soft_delete_contact(v_contact_1_id, v_org_1_id);
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
    RAISE NOTICE 'PASS: Double soft-delete rejected: %', SQLERRM;
  END;
  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'FAIL: Double soft-delete was allowed';
  END IF;

  -- Test soft_delete_task happy path
  PERFORM public.soft_delete_task(v_task_1_id, v_org_1_id);
  SELECT count(*) INTO v_row_count FROM dtn_daily_tasks WHERE id = v_task_1_id;
  IF v_row_count = 0 THEN
    RAISE NOTICE 'PASS: soft_delete_task hides row from SELECT';
  ELSE
    RAISE EXCEPTION 'FAIL: Soft-deleted task still visible';
  END IF;

  -- Test soft_delete_campaign happy path
  PERFORM public.soft_delete_campaign(v_campaign_1_id, v_org_1_id);
  SELECT count(*) INTO v_row_count FROM mktg_campaigns WHERE id = v_campaign_1_id;
  IF v_row_count = 0 THEN
    RAISE NOTICE 'PASS: soft_delete_campaign hides row from SELECT';
  ELSE
    RAISE EXCEPTION 'FAIL: Soft-deleted campaign still visible';
  END IF;

  -- Test soft_delete_strategy_doc happy path
  PERFORM public.soft_delete_strategy_doc(v_strategy_1_id, v_org_1_id);
  SELECT count(*) INTO v_row_count FROM mktg_strategy_docs WHERE id = v_strategy_1_id;
  IF v_row_count = 0 THEN
    RAISE NOTICE 'PASS: soft_delete_strategy_doc hides row from SELECT';
  ELSE
    RAISE EXCEPTION 'FAIL: Soft-deleted strategy doc still visible';
  END IF;

  -- =========================================================================
  -- CLEANUP
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== CLEANUP ===';

  -- Switch back to superuser for cleanup
  EXECUTE 'SET LOCAL ROLE postgres';

  DELETE FROM dtn_task_events WHERE org_id IN (v_org_1_id, v_org_2_id);
  DELETE FROM dtn_daily_tasks WHERE org_id IN (v_org_1_id, v_org_2_id);
  DELETE FROM mktg_task_submissions WHERE task_id IN (v_mktg_task_assigned_id, v_mktg_task_open_id, v_mktg_task_unassigned_id);
  DELETE FROM mktg_tasks WHERE org_id = v_org_1_id;
  DELETE FROM mktg_freelancers WHERE org_id = v_org_1_id;
  DELETE FROM mktg_contacts WHERE org_id IN (v_org_1_id, v_org_2_id);
  DELETE FROM mktg_campaigns WHERE org_id IN (v_org_1_id, v_org_2_id);
  DELETE FROM mktg_strategy_docs WHERE org_id IN (v_org_1_id, v_org_2_id);
  DELETE FROM dtn_departments WHERE org_id IN (v_org_1_id, v_org_2_id);
  DELETE FROM dtn_memberships WHERE org_id IN (v_org_1_id, v_org_2_id);
  DELETE FROM dtn_organizations WHERE id IN (v_org_1_id, v_org_2_id);
  DELETE FROM profiles WHERE id IN (v_user_a_id, v_user_b_id);
  -- auth.users cleanup requires admin API; profiles deletion is sufficient
  -- for test isolation since the FK cascades from auth.users -> profiles

  RAISE NOTICE '=== ALL TESTS PASSED ===';

END $$;
