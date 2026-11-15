-- MVP-001: validate the checks widened / added NOT VALID in 20261115140000_email_mailbox_zoho.
--
-- Class A: VALIDATE CONSTRAINT scans the table under a SHARE UPDATE EXCLUSIVE lock only, so
-- reads and writes keep going. Every row allowed before still passes (the checks were only
-- widened, and no ZOHO row exists yet), so validation cannot fail on existing data. Run in its
-- own migration (own transaction) so the previous migration's brief drop/add lock is not held
-- through the scan (PG-207 pattern, see 20261020120310).
--
-- Recovery plan: forward-only; a failed validation leaves the checks NOT VALID (still enforced
-- for new rows) and changes no data.

ALTER TABLE "email_mailboxes" VALIDATE CONSTRAINT "email_mailboxes_kind_check";
ALTER TABLE "email_mailboxes" VALIDATE CONSTRAINT "email_mailboxes_zoho_active_check";
ALTER TABLE "email_oauth_states" VALIDATE CONSTRAINT "email_oauth_states_provider_check";
ALTER TABLE "email_records" VALIDATE CONSTRAINT "email_records_provider_check";