-- PG-198: tenant approval policies (ADR-079).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * agent_actions: two NULLABLE columns with no default and DROP NOT NULL on
--     "confidenceScore" -> metadata-only on PG 11+, no table rewrite, no
--     backfill, no existing row changes. Existing rows keep their values.
--   * No index on "agent_actions" here: a non-concurrent index inside the
--     migration transaction would take a SHARE lock (blocks writes). The sweep
--     index ships CONCURRENTLY in 20261016120100_agent_actions_pending_sweep_idx.
--   * Two NEW tables with their own constraints, indexes and RLS policies.
--
-- Recovery plan: forward-only. Operational rollback = delete the tenant's
-- policies (Reset to Defaults on the page); with no rows every approval path
-- uses the built-in defaults, which equal the behaviour before this migration.
-- A down-migration (DROP TABLE x2, DROP COLUMN x2, SET NOT NULL after a
-- backfill) is Class C — human-only, never run autonomously.
--
-- Production applies only through the gated `prisma migrate deploy` workflow.

-- ── agent_actions ──────────────────────────────────────────────────────────
-- RF-2: confidence is the calling agent's real value or NULL (never derived
-- from impact). escalatedAt/escalatedTo are written once by the approval sweep.
ALTER TABLE "agent_actions" ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalatedTo" TEXT,
ALTER COLUMN "confidenceScore" DROP NOT NULL;

-- ── approval_policies ──────────────────────────────────────────────────────
CREATE TABLE "approval_policies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "colorToken" TEXT NOT NULL DEFAULT 'slate',
    "scope" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "timeoutMinutes" INTEGER NOT NULL,
    "minReviewerRole" TEXT NOT NULL DEFAULT 'USER',
    "autoApproveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoApproveMinConfidence" INTEGER,
    "escalationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "escalateAfterMinutes" INTEGER,
    "escalationTargetUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_policies_scope_check"
        CHECK ("scope" IN ('AGENT_TOOL', 'AUTO_RESPONSE')),
    -- Same 18-token allowlist as account_tags / account_territories
    CONSTRAINT "approval_policies_colorToken_check"
        CHECK ("colorToken" IN (
            'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'green',
            'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
            'purple', 'fuchsia', 'pink', 'rose'
        )),
    CONSTRAINT "approval_policies_minReviewerRole_check"
        CHECK ("minReviewerRole" IN ('USER', 'SALES_REP', 'MANAGER', 'ADMIN')),
    CONSTRAINT "approval_policies_timeoutMinutes_check"
        CHECK ("timeoutMinutes" BETWEEN 5 AND 10080),
    -- ISO 42001 D.1: automatic approval only above 0.9 confidence
    CONSTRAINT "approval_policies_autoApproveMinConfidence_check"
        CHECK ("autoApproveMinConfidence" IS NULL OR "autoApproveMinConfidence" BETWEEN 90 AND 99),
    CONSTRAINT "approval_policies_autoApprove_threshold_check"
        CHECK (NOT "autoApproveEnabled" OR "autoApproveMinConfidence" IS NOT NULL),
    -- The target is not required here: ON DELETE SET NULL must be able to clear it
    -- (the page then shows "former user" and the sweep skips the policy).
    CONSTRAINT "approval_policies_escalation_check"
        CHECK (
            "escalateAfterMinutes" IS NULL
            OR ("escalateAfterMinutes" >= 5 AND "escalateAfterMinutes" < "timeoutMinutes")
        ),
    CONSTRAINT "approval_policies_escalation_delay_check"
        CHECK (NOT "escalationEnabled" OR "escalateAfterMinutes" IS NOT NULL)
);

-- Playbook §7: AI toggles default OFF — restated explicitly for the record.
ALTER TABLE "approval_policies" ALTER COLUMN "autoApproveEnabled" SET DEFAULT false;
ALTER TABLE "approval_policies" ALTER COLUMN "escalationEnabled" SET DEFAULT false;

-- ── approval_policy_assignments ────────────────────────────────────────────
CREATE TABLE "approval_policy_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "agentKey" VARCHAR(64) NOT NULL,
    "actionType" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_policy_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_policy_assignments_not_double_wildcard_check"
        CHECK (NOT ("agentKey" = '*' AND "actionType" = '*'))
);

-- ── Indexes (Prisma-declared) ──────────────────────────────────────────────
CREATE INDEX "approval_policies_tenantId_scope_idx" ON "approval_policies"("tenantId", "scope");
CREATE UNIQUE INDEX "approval_policies_tenantId_id_key" ON "approval_policies"("tenantId", "id");
CREATE UNIQUE INDEX "approval_policies_tenantId_id_scope_key" ON "approval_policies"("tenantId", "id", "scope");
CREATE INDEX "approval_policy_assignments_tenantId_policyId_idx" ON "approval_policy_assignments"("tenantId", "policyId");
-- One policy per (agent, action) pair per queue per tenant -> deterministic resolution.
CREATE UNIQUE INDEX "approval_policy_assignments_tenantId_scope_agentKey_actionT_key" ON "approval_policy_assignments"("tenantId", "scope", "agentKey", "actionType");

-- ── Indexes (SQL-only; Prisma cannot express them — see schema.prisma comment) ──
-- Case-insensitive policy names per tenant and queue.
CREATE UNIQUE INDEX "approval_policies_tenant_scope_lower_name_key"
    ON "approval_policies"("tenantId", "scope", lower("name"));
-- At most one default policy per tenant and queue.
CREATE UNIQUE INDEX "approval_policies_one_default_key"
    ON "approval_policies"("tenantId", "scope") WHERE "isDefault";

-- ── Foreign keys ───────────────────────────────────────────────────────────
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Plain FK — under ADR-071 a user can belong to a tenant through a membership,
-- so tenant validity is checked in the app with tenantUserWhere.
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_escalationTargetUserId_fkey" FOREIGN KEY ("escalationTargetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Composite FK: an assignment always carries its policy's tenant and scope (DBA-012).
ALTER TABLE "approval_policy_assignments" ADD CONSTRAINT "approval_policy_assignments_tenantId_policyId_scope_fkey" FOREIGN KEY ("tenantId", "policyId", "scope") REFERENCES "approval_policies"("tenantId", "id", "scope") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-level security (defence in depth; shape of 20261007130000_account_territories) ──
-- The application-level tenant boundary is the explicit tenantId in every query
-- (prismaWithTenant does not inject it, and RLS is not FORCEd in this project).
ALTER TABLE "approval_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_policy_assignments" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "approval_policies_tenant_isolation" ON "approval_policies"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "approval_policy_assignments_tenant_isolation" ON "approval_policy_assignments"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
