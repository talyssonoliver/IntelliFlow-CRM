-- Add timezone column to appointments table
-- Part of UTC-first timezone refactor (2026-03-15)
-- Nullable: NULL means UTC (matches schema default)
-- Reversible with: ALTER TABLE "appointments" DROP COLUMN "timezone";

ALTER TABLE "appointments" ADD COLUMN "timezone" TEXT;
