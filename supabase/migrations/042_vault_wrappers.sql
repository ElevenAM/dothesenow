-- Vault wrapper functions: expose vault operations via public schema for PostgREST.
-- PostgREST cannot call vault.* directly (schema not in pgrst.db_schemas).
-- All wrappers are SECURITY DEFINER + service_role-only.
BEGIN;

-- ─── 1. Create secret ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dtn_vault_create_secret(
  p_secret TEXT,
  p_name   TEXT
) RETURNS UUID
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, vault
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'access denied: service_role required';
  END IF;

  RETURN vault.create_secret(p_secret, p_name);
END;
$$;

REVOKE ALL ON FUNCTION public.dtn_vault_create_secret(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dtn_vault_create_secret(TEXT, TEXT) TO service_role;

-- ─── 2. Read (decrypt) secret ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.dtn_vault_read_secret(
  p_secret_id UUID
) RETURNS TEXT
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, vault
AS $$
DECLARE
  result TEXT;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'access denied: service_role required';
  END IF;

  SELECT decrypted_secret INTO result
  FROM vault.decrypted_secrets
  WHERE id = p_secret_id;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.dtn_vault_read_secret(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dtn_vault_read_secret(UUID) TO service_role;

-- ─── 3. Delete secret ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dtn_vault_delete_secret(
  p_secret_id UUID
) RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, vault
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'access denied: service_role required';
  END IF;

  DELETE FROM vault.secrets WHERE id = p_secret_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dtn_vault_delete_secret(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dtn_vault_delete_secret(UUID) TO service_role;

COMMIT;
