-- IFC-191: Add timezone field to users for timezone-aware greeting
-- Additive migration — safe for zero-downtime deployment
-- Reversible with: ALTER TABLE "users" DROP COLUMN "timezone";

ALTER TABLE "users" ADD COLUMN "timezone" TEXT DEFAULT 'UTC';
