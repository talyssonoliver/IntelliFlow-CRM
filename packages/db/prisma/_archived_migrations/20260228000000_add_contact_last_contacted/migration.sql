-- IFC-192: Add lastContactedAt to Contact model for activity tracking
ALTER TABLE "contacts" ADD COLUMN "lastContactedAt" TIMESTAMP(3);

-- IFC-192: Composite index for stale contact queries (tenant-scoped)
CREATE INDEX "contacts_tenantId_lastContactedAt_idx" ON "contacts"("tenantId", "lastContactedAt");

-- IFC-192: Composite index for stale contact EXISTS subquery (NF-004)
CREATE INDEX "opportunities_contactId_stage_idx" ON "opportunities"("contactId", "stage");
