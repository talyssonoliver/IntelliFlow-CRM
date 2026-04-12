-- Fix schema drift for chain_versions columns expected by Prisma model
ALTER TABLE "chain_versions" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "chain_versions" ADD COLUMN IF NOT EXISTS "parentVersionId" TEXT;
ALTER TABLE "chain_versions" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chain_versions_parentVersionId_fkey'
      AND conrelid = 'chain_versions'::regclass
  ) THEN
    ALTER TABLE "chain_versions"
      ADD CONSTRAINT "chain_versions_parentVersionId_fkey"
      FOREIGN KEY ("parentVersionId") REFERENCES "chain_versions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
