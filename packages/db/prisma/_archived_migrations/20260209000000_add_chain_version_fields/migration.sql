-- AlterTable: Add missing fields to chain_versions
ALTER TABLE "chain_versions" ADD COLUMN "description" TEXT;
ALTER TABLE "chain_versions" ADD COLUMN "parentVersionId" TEXT;
ALTER TABLE "chain_versions" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
