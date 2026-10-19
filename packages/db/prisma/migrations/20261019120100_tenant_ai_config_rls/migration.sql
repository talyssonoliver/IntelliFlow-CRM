-- PG-199: tenant isolation policy for tenant_ai_config (ADR-082).
--
-- Kept in its own migration so it can be removed without touching the PG-199 columns
-- (owned by PG-199 per the batch coordinator; projects-64's tenant-hardening lane does no
-- RLS work on this table).
--
-- Production RLS state of tenant_ai_config before this migration: unknown, projects-64
-- verifies at rehearsal. The creation migration (20260421000000) ran ENABLE ROW LEVEL
-- SECURITY without any policy; this adds the missing policy.
--
-- Class A: isolation-preserving RLS. ENABLE only, never FORCE (the table owner keeps
-- bypassing it). The application-level tenant boundary remains the explicit tenantId in
-- every query; no code path relies on this policy filtering rows. Shape of
-- 20261013120000_case_types.
--
-- Recovery plan: forward-only. DROP POLICY is Class C (human-only).

ALTER TABLE "tenant_ai_config" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_ai_config_tenant_isolation" ON "tenant_ai_config"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
