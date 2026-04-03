-- Migration 009: Move pgvector extension from public to extensions schema
--
-- Fixes Supabase security advisor warning:
--   "Extension `vector` is installed in the public schema"
--
-- ALTER EXTENSION SET SCHEMA moves all extension objects (types, operators,
-- operator classes) to the target schema. Existing columns using the vector
-- type are unaffected — they retain their type reference automatically.

ALTER EXTENSION vector SET SCHEMA extensions;
