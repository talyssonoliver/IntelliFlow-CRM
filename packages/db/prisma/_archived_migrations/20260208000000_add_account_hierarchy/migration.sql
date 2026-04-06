-- PG-134: Add parent/child account hierarchy support
-- Adds parentAccountId column to accounts table for self-referencing hierarchy

-- Add the parentAccountId column
ALTER TABLE "accounts" ADD COLUMN "parentAccountId" TEXT;

-- Add foreign key constraint (self-reference, SET NULL on delete)
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parentAccountId_fkey"
  FOREIGN KEY ("parentAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for hierarchy queries
CREATE INDEX "accounts_parentAccountId_idx" ON "accounts"("parentAccountId");
