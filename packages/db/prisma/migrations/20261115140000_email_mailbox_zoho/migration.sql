-- MVP-001: Connect Zoho Mail over Zoho's HTTPS API (outbound SMTP is blocked on our hosting).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive and widening only.
--   * Two nullable columns on "email_mailboxes": the Zoho Mail account id the API addresses,
--     and the API host of the account's data centre (from Zoho's token response). Neither is a
--     credential; both are useless without the mailbox's encrypted refresh token.
--   * Three CHECK constraints are widened to also allow 'ZOHO' (mailbox kind, OAuth connect
--     state provider, email record provider). Every value allowed before is still allowed, so
--     no existing row can fail them. Each is dropped and re-added NOT VALID here (a brief lock,
--     no table scan); the next migration validates them in its own transaction, under a SHARE
--     UPDATE EXCLUSIVE lock only, so reads and writes keep going (the PG-207 pattern).
--   * One new CHECK, NOT VALID (validated next): an ACTIVE Zoho mailbox carries its account id
--     and API host. No Zoho row exists before this migration, so nothing can fail it.
--   * No data is read, rewritten or deleted; no RLS policy changes.
--
-- Recovery plan: forward-only. Operational rollback = Zoho connect stays unconfigured
-- (EMAIL_OAUTH_ZOHO_CLIENT_ID unset), so no ZOHO row is ever written and the wider checks and
-- columns are simply unused. Narrowing the checks back or dropping the columns is Class C -
-- human-only, never autonomous.
-- If this file fails it rolls back whole (one transaction) and `prisma migrate deploy` stops:
-- fix the cause, `prisma migrate resolve --rolled-back 20261115140000_email_mailbox_zoho`, deploy again.
--
-- Production applies only through the gated `prisma migrate deploy` workflow, with the
-- owner's yes, before the API that writes ZOHO rows is promoted.

SET lock_timeout = '5s';

ALTER TABLE "email_mailboxes"
    ADD COLUMN "oauthAccountId" VARCHAR(64),
    ADD COLUMN "oauthApiDomain" VARCHAR(64);

ALTER TABLE "email_mailboxes" DROP CONSTRAINT "email_mailboxes_kind_check";
ALTER TABLE "email_mailboxes" ADD CONSTRAINT "email_mailboxes_kind_check"
    CHECK ("kind" IN ('SMTP', 'GMAIL', 'MICROSOFT', 'ZOHO')) NOT VALID;

ALTER TABLE "email_mailboxes" ADD CONSTRAINT "email_mailboxes_zoho_active_check"
    CHECK ("kind" <> 'ZOHO' OR "status" <> 'ACTIVE'
        OR ("oauthAccountId" IS NOT NULL AND "oauthApiDomain" IS NOT NULL)) NOT VALID;

ALTER TABLE "email_oauth_states" DROP CONSTRAINT "email_oauth_states_provider_check";
ALTER TABLE "email_oauth_states" ADD CONSTRAINT "email_oauth_states_provider_check"
    CHECK ("provider" IN ('GMAIL', 'MICROSOFT', 'ZOHO')) NOT VALID;

ALTER TABLE "email_records" DROP CONSTRAINT "email_records_provider_check";
ALTER TABLE "email_records" ADD CONSTRAINT "email_records_provider_check"
    CHECK ("provider" IS NULL OR "provider" IN ('SMTP', 'GMAIL', 'MICROSOFT', 'ZOHO')) NOT VALID;

RESET lock_timeout;
