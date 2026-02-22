-- IFC-068: Feedback Analytics Dashboard
-- Replace single-column indexes with compound indexes for tenant-scoped analytics queries

-- Drop existing single-column indexes (redundant with compound indexes below)
DROP INDEX IF EXISTS "feedback_surveys_type_idx";
DROP INDEX IF EXISTS "feedback_surveys_status_idx";
DROP INDEX IF EXISTS "feedback_surveys_score_idx";
DROP INDEX IF EXISTS "feedback_surveys_tenantId_idx";

-- Add compound indexes for analytics query patterns
CREATE INDEX "feedback_surveys_tenantId_createdAt_idx" ON "feedback_surveys"("tenantId", "createdAt");
CREATE INDEX "feedback_surveys_tenantId_type_idx" ON "feedback_surveys"("tenantId", "type");
CREATE INDEX "feedback_surveys_tenantId_type_createdAt_idx" ON "feedback_surveys"("tenantId", "type", "createdAt");
CREATE INDEX "feedback_surveys_tenantId_status_idx" ON "feedback_surveys"("tenantId", "status");

-- Add CHECK constraints for score and rating validity
ALTER TABLE "feedback_surveys" ADD CONSTRAINT "feedback_surveys_score_range" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 10));
ALTER TABLE "feedback_surveys" ADD CONSTRAINT "feedback_surveys_rating_range" CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5));
