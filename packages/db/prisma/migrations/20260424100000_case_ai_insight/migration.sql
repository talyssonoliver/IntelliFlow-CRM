-- PG-190: CaseAIInsight — per-case AI-generated insight row
-- Mirrors ContactAIInsight / AccountAIInsight shape. Written by ai-worker
-- chains (summarization, priority prediction, resolution suggestion,
-- insight generation) when the tenant-level toggle for that chain is ON.
--
-- One row per case (UNIQUE caseId), cascade-deleted when the case is removed.

CREATE TABLE "case_ai_insights" (
    "id"                  TEXT NOT NULL,
    "caseId"              TEXT NOT NULL,
    "tenantId"            TEXT NOT NULL,
    "summary"             TEXT,
    "predictedPriority"   "CasePriority",
    "suggestedResolution" TEXT,
    "recommendations"     JSONB,
    "modelVersion"        TEXT,
    "generatedAt"         TIMESTAMP(3),
    "source"              TEXT DEFAULT 'llm',
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_ai_insights_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_ai_insights_caseId_key" ON "case_ai_insights" ("caseId");
CREATE INDEX "case_ai_insights_tenantId_idx" ON "case_ai_insights" ("tenantId");

ALTER TABLE "case_ai_insights"
  ADD CONSTRAINT "case_ai_insights_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "cases"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_ai_insights"
  ADD CONSTRAINT "case_ai_insights_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable Row-Level Security per project convention.
ALTER TABLE "case_ai_insights" ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy — every caller must have the tenant claim set.
DO $$ BEGIN
  CREATE POLICY "case_ai_insights_tenant_isolation" ON "case_ai_insights"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
