-- Enable Row-Level Security on document_type_definitions.
-- This table was added post the initial settings-tables RLS backfill
-- (migration 20260420000000_enable_rls_for_remaining_settings_tables); RLS
-- must be enforced on every tenantId-scoped public table. Surfaced by
-- packages/db/src/__tests__/rls-migrations.test.ts.

ALTER TABLE "document_type_definitions" ENABLE ROW LEVEL SECURITY;
