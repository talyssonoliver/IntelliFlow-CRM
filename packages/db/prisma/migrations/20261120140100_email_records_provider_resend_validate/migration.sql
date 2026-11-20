-- MVP-011: validate "email_records_provider_check_v2" (added NOT VALID in
-- 20261120140000_email_records_provider_resend), then retire the old check.
--
-- Class A: VALIDATE CONSTRAINT scans the table under a SHARE UPDATE EXCLUSIVE lock only, so reads and
-- writes keep going; it cannot fail on existing data (the new check only widens the old one, which every
-- row already passes). It runs in its own migration (own transaction) so the previous migration's lock is
-- not held through the scan (PG-207 pattern, see 20261020120310).
--
-- Then, in the same transaction and only after the validation succeeded: drop the old, narrower check
-- (this is what lets RESEND through) and rename the new one to the old name so the name stays what the
-- code and earlier migrations refer to. DROP and RENAME of a CHECK are metadata-only and brief.
--
-- Recovery plan: forward-only; a failed validation leaves the new check NOT VALID (still enforced for new
-- rows), the old check in place and no data changed. If this file fails, `prisma migrate deploy` stops
-- here: fix the cause, `prisma migrate resolve --rolled-back 20261120140100_email_records_provider_resend_validate`,
-- deploy again.

-- VALIDATE only waits behind autovacuum or another VALIDATE; cap that wait.
SET lock_timeout = '30s';

ALTER TABLE "email_records" VALIDATE CONSTRAINT "email_records_provider_check_v2";

-- DROP and RENAME need a brief ACCESS EXCLUSIVE lock on the table: do not queue readers and writers behind
-- them for long. If they cannot get it in 5s the whole file rolls back (nothing changes) and is retried.
SET lock_timeout = '5s';

ALTER TABLE "email_records" DROP CONSTRAINT "email_records_provider_check";
ALTER TABLE "email_records" RENAME CONSTRAINT "email_records_provider_check_v2" TO "email_records_provider_check";

RESET lock_timeout;
