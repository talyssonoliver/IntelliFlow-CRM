-- PG-194: daily compliance snapshots, the stored history behind the compliance dashboard's trend.
--
-- Class A (ADR-069): purely additive. One new table, one unique index, one lookup index, a cascading
-- foreign key to tenants and a tenant-isolation RLS policy. No existing table or column is read or
-- changed, so old application code keeps working against the new schema.
--
-- Recovery plan: forward-only. Operational rollback = stop writing (the dashboard shows "trend
-- starts tomorrow" without rows). DROP TABLE is Class C - human-only, never autonomous.
-- Production applies only through the gated `prisma migrate deploy` workflow, before the API that
-- writes the table is promoted.

CREATE TABLE "compliance_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "frameworkId" VARCHAR(40) NOT NULL,
    "score" INTEGER,
    "passing" INTEGER NOT NULL DEFAULT 0,
    "attention" INTEGER NOT NULL DEFAULT 0,
    "notMeasured" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "compliance_snapshots_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100))
);

CREATE UNIQUE INDEX "compliance_snapshots_tenantId_day_frameworkId_key"
    ON "compliance_snapshots"("tenantId", "day", "frameworkId");

CREATE INDEX "compliance_snapshots_tenantId_frameworkId_day_idx"
    ON "compliance_snapshots"("tenantId", "frameworkId", "day");

ALTER TABLE "compliance_snapshots" ADD CONSTRAINT "compliance_snapshots_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security: ENABLE only, never FORCE (the table owner keeps bypassing it, as the daily
-- job needs). The explicit tenantId in every query remains the application-level boundary.
ALTER TABLE "compliance_snapshots" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "compliance_snapshots_tenant_isolation" ON "compliance_snapshots"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
