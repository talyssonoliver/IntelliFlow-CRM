-- IFC-312 audit fix F3 (2026-04-24)
-- Adds per-account tags array to mirror the Contact.tags pattern. The
-- `account.addTags` tRPC procedure (spec §4.3.4 assumed this existed) writes
-- into this column. `AccountTag` remains the tenant vocabulary table,
-- distinct from this per-row array.
ALTER TABLE "accounts" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL;
