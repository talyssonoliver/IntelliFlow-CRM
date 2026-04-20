-- PG-190 v2 hardening — enforce the 8-token color allowlist at the DB layer
-- so direct SQL inserts or future migrations can't widen it silently.
--
-- Normalize any pre-existing rows that fell outside the allowlist before
-- adding the constraint — this makes the migration idempotent across
-- restored backups, seeded test DBs, or any environment where a legacy
-- token slipped in while the column was plain TEXT.

UPDATE "case_tags"
SET "colorToken" = 'slate'
WHERE "colorToken" NOT IN ('slate', 'blue', 'red', 'amber', 'green', 'violet', 'rose', 'teal');

ALTER TABLE "case_tags"
    ADD CONSTRAINT "case_tags_colorToken_check"
    CHECK ("colorToken" IN ('slate', 'blue', 'red', 'amber', 'green', 'violet', 'rose', 'teal'));
