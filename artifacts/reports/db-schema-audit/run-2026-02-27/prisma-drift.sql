-- Prisma Migrate Diff: schema-datasource → schema-datamodel
-- Generated: 2026-02-28 (post-remediation)
-- Previous: 543 lines of destructive drift (enums, DROP COLUMNs, DROP FKs)
-- Current: 2 minor additive changes (no data loss risk)

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "lastContactedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "contacts_tenantId_lastContactedAt_idx" ON "contacts"("tenantId", "lastContactedAt");
