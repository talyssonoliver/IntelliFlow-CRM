-- MVP-013: validate the check added NOT VALID in 20261120010000_google_calendar_sync.
--
-- Class A: VALIDATE CONSTRAINT scans the table under a SHARE UPDATE EXCLUSIVE lock only, so reads
-- and writes keep going. Every row passes (the column was just added with the default 'ACTIVE'), so
-- validation cannot fail on existing data. Run in its own migration (own transaction) so the
-- previous migration's lock is not held through the scan (PG-207 pattern, see 20261020120310).
--
-- Recovery plan: forward-only; a failed validation leaves the check NOT VALID (still enforced for
-- new rows) and changes no data. If this file fails, `prisma migrate deploy` stops here and
-- refuses later deploys: fix the cause, then `prisma migrate resolve --rolled-back
-- 20261120010100_google_calendar_sync_validate` and run `prisma migrate deploy` again.

-- VALIDATE only waits behind autovacuum or another VALIDATE; cap that wait.
SET lock_timeout = '30s';

ALTER TABLE "email_mailboxes" VALIDATE CONSTRAINT "email_mailboxes_calendarStatus_check";

RESET lock_timeout;
