-- MVP-011: let an email record carry provider 'RESEND' (the COA outreach sends the importer writes).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): widening only.
--   * "email_records_provider_check" allows NULL, SMTP, GMAIL, MICROSOFT and ZOHO. The COA send importer
--     (tools/scripts/import-coa-sends.ts) writes RESEND, which the constraint refuses, so `--apply` stopped
--     with a check violation (its dry run never inserts, and the unit tests used a fake that does not
--     enforce constraints).
--   * This migration only ADDS the wider check next to the old one, NOT VALID (a brief lock, no table
--     scan; new rows are already checked against it). Every value the old check allows is allowed by the
--     new one, so no existing row can fail it. The next migration validates it in its own transaction,
--     drops the old check and gives the new one the old name.
--   * No data is read, rewritten or deleted; no RLS policy changes.
--
-- Recovery plan: forward-only. Until the next migration runs the old check still stands and RESEND rows
-- are still refused, exactly as today; nothing else changes. Narrowing the check back is Class C -
-- human-only, never autonomous.
-- If this file fails it rolls back whole (one transaction) and `prisma migrate deploy` stops: fix the cause,
-- `prisma migrate resolve --rolled-back 20261120140000_email_records_provider_resend`, deploy again.

SET lock_timeout = '5s';

ALTER TABLE "email_records" ADD CONSTRAINT "email_records_provider_check_v2"
    CHECK ("provider" IS NULL OR "provider" IN ('SMTP', 'GMAIL', 'MICROSOFT', 'ZOHO', 'RESEND')) NOT VALID;

RESET lock_timeout;
