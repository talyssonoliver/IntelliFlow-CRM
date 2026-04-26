-- PG-126 follow-up — enable RLS on the public_feedback table.
--
-- The table is tenant-agnostic (anonymous public-site submissions captured
-- before signup), so the original PG-126 migration omitted the RLS guard.
-- Our security baseline enforced by packages/db/src/__tests__/rls-migrations.test.ts
-- still requires every public table to have RLS enabled.
--
-- The tRPC router writes to this table via the Supabase service_role connection,
-- which bypasses RLS by default, so no row policies are required for backend
-- ingestion. With RLS enabled and no policies present, anonymous/authenticated
-- roles are denied by default — exactly what we want for an opaque feedback sink.

ALTER TABLE "public_feedback" ENABLE ROW LEVEL SECURITY;
