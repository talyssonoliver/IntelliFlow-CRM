-- MVP-012: validate the foreign key and the CHECK added NOT VALID in
-- 20261118100000_contact_reply_draft_lead_id.
--
-- Class A: VALIDATE CONSTRAINT scans the table under a SHARE UPDATE EXCLUSIVE lock only, so
-- reads and writes keep going. Every existing row has a "contactId" and a null "leadId", so
-- both pass, and validation cannot fail on existing data. It runs in its own migration, with
-- its own transaction, so the previous migration's brief lock is not held through the scan
-- (the PG-207 pattern, see 20261115140100_email_mailbox_zoho_validate).
--
-- Recovery plan: forward-only. A failed validation leaves the constraints NOT VALID (still
-- enforced for new rows) and changes no data. If this file fails, `prisma migrate deploy` stops
-- here and refuses later deploys. Fix the cause, run `prisma migrate resolve --rolled-back
-- 20261118100100_contact_reply_draft_lead_id_validate`, then run `prisma migrate deploy` again.

-- VALIDATE only waits behind autovacuum or another VALIDATE; cap that wait.
SET lock_timeout = '30s';

ALTER TABLE "contact_reply_drafts" VALIDATE CONSTRAINT "contact_reply_drafts_leadId_fkey";
ALTER TABLE "contact_reply_drafts" VALIDATE CONSTRAINT "contact_reply_drafts_one_subject_check";

RESET lock_timeout;
