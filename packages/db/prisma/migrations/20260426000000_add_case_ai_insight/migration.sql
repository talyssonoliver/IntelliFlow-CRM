-- PG-190 hotfix (2026-04-26)
-- Adds the missing CaseAIInsight model. Commit f3fbdd1e shipped four chain
-- files (case-insight, case-priority-prediction, case-resolution-suggestion,
-- case-summarization) that call `prisma.caseAIInsight.upsert(...)`, but no
-- model existed in the schema. The chains used `as never` casts which masked
-- the type error in IDEs but failed `tsc --noEmit`, blocking master.
--
-- Shape mirrors AccountAIInsight (provenance triple: modelVersion +
-- generatedAt + source). Each chain populates a subset of the AI-generated
-- fields, so all are nullable. predictedPriority reuses the existing
-- CasePriority enum (LOW|MEDIUM|HIGH|URGENT) for compile-time safety.

CREATE TABLE "case_ai_insights" (
    "id"                  TEXT NOT NULL,
    "caseId"              TEXT NOT NULL,
    "tenantId"            TEXT NOT NULL,
    "summary"             TEXT,
    "predictedPriority"   "CasePriority",
    "suggestedResolution" TEXT,
    "recommendations"     JSONB,
    "modelVersion"        TEXT,
    "generatedAt"         TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
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
