-- PG-190 v2 hardening — enforce the 8-token color allowlist at the DB layer
-- so direct SQL inserts or future migrations can't widen it silently.
ALTER TABLE "case_tags"
    ADD CONSTRAINT "case_tags_colorToken_check"
    CHECK ("colorToken" IN ('slate', 'blue', 'red', 'amber', 'green', 'violet', 'rose', 'teal'));
