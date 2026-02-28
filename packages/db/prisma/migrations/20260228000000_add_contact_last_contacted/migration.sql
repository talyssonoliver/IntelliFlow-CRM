-- IFC-192: Add lastContactedAt to Contact model for activity tracking
ALTER TABLE "contacts" ADD COLUMN "lastContactedAt" TIMESTAMP(3);

-- IFC-192: Composite index for stale contact queries (tenant-scoped)
CREATE INDEX "contacts_tenantId_lastContactedAt_idx" ON "contacts"("tenantId", "lastContactedAt");
