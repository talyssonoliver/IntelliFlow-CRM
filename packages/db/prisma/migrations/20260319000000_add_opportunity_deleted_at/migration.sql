-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN "deletedAt" TIMESTAMP(3);
-- CreateIndex
CREATE INDEX "opportunities_deletedAt_idx" ON "opportunities"("deletedAt");
