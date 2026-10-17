-- IntelliFlow CRM - test PostgreSQL initialisation (postgres-test service).
--
-- Runs once, when the postgres-test container's volume is first created. The dev
-- init.sql cannot be reused: it ALTERs `intelliflow_dev`, which does not exist in
-- the test container, and it puts `extensions` BEFORE `public` on the search_path
-- so app tables would land in the extensions schema (#271).
--
-- Per-run ephemeral databases (scripts/test-db.mjs) apply the same bootstrap to
-- each fresh database; this file keeps a fresh `docker compose up postgres-test`
-- migratable too.

-- The baseline migration GRANTs to the Supabase roles; a plain pgvector image has
-- none of them. Keep in sync with SUPABASE_ROLES_SQL in scripts/lib/ephemeral-test-db.mjs.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS extensions;
-- uuid-ossp (into `extensions`) and vector (into `public`) are installed by the
-- baseline migration itself. Do NOT pre-install vector into `extensions`: the
-- baseline's unqualified CREATE EXTENSION would then no-op and the `vector` type
-- would be invisible to `?schema=public` connections.

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path TO public, extensions', current_database());
  EXECUTE format('ALTER DATABASE %I SET timezone TO ''UTC''', current_database());
END $$;
