-- AlterTable: Add sourceLeadId to Opportunity for lead-to-deal traceability (IFC-062)
ALTER TABLE "opportunities" ADD COLUMN "sourceLeadId" TEXT;

-- CreateIndex: Index on sourceLeadId for traceability queries
CREATE INDEX "opportunities_sourceLeadId_idx" ON "opportunities"("sourceLeadId");
