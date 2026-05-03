-- Fix IFC-227 column-name drift: every other "leads" column is camelCase
-- but 20260427_add_account_to_lead created "account_id". The Prisma schema
-- field has no @map, so generated SQL selects "accountId" and Postgres
-- errors with: column "accountId" does not exist (Prisma logs it as
-- "(not available)"). Rename the column, FK, and index to match.

ALTER TABLE "leads" RENAME COLUMN "account_id" TO "accountId";

ALTER TABLE "leads" RENAME CONSTRAINT "leads_account_id_fkey" TO "leads_accountId_fkey";

ALTER INDEX "leads_account_id_idx" RENAME TO "leads_accountId_idx";
