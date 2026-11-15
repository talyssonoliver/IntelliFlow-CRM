-- MVP-001: validate the checks widened / added NOT VALID in 20261115140000_email_mailbox_zoho.
--
-- Class A: VALIDATE CONSTRAINT scans the table under a SHARE UPDATE EXCLUSIVE lock only, so
-- reads and writes keep going. Every row allowed before still passes (the checks were only
-- widened, and no ZOHO row exists yet), so validation cannot fail on existing data. Run in its
-- own migration (own transaction) so the previous migration's brief drop/add lock is not held
-- through the scan (PG-207 pattern, see 20261020120310).
--
-- Recovery plan: forward-only; a failed validation leaves the checks NOT VALID (still enforced
-- for new rows) and changes no data. If this file fails, `prisma migrate deploy` stops here and
-- refuses later deploys: fix the cause, then `prisma migrate resolve --rolled-back
-- 20261115140100_email_mailbox_zoho_validate` and run `prisma migrate deploy` again.

-- VALIDATE only waits behind autovacuum or another VALIDATE; cap that wait.
SET lock_timeout = '30s';

ALTER TABLE "email_mailboxes" VALIDATE CONSTRAINT "email_mailboxes_kind_check";
ALTER TABLE "email_mailboxes" VALIDATE CONSTRAINT "email_mailboxes_zoho_active_check";
ALTER TABLE "email_oauth_states" VALIDATE CONSTRAINT "email_oauth_states_provider_check";
ALTER TABLE "email_records" VALIDATE CONSTRAINT "email_records_provider_check";

RESET lock_timeout;
