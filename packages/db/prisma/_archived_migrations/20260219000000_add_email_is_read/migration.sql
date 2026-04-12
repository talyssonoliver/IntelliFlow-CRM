-- Migration: add_email_is_read
-- Adds isRead and readAt columns to EmailRecord for read-state tracking

ALTER TABLE "email_records" ADD COLUMN "isRead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "email_records" ADD COLUMN "readAt" TIMESTAMP(3);
CREATE INDEX "email_records_tenantId_isRead_idx" ON "email_records"("tenantId", "isRead");
