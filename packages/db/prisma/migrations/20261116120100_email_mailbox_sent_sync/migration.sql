-- #1177: Outlook / Microsoft 365 two-way sync - the Sent Items cursor.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only. One nullable
-- column on "email_mailboxes"; no row is read or changed, no constraint, index or RLS change.
-- "syncSentCursor" holds Graph's delta link for Sent Items (not a credential).
--
-- Recovery plan: forward-only; EMAIL_INBOX_SYNC=off leaves it unused. A down-migration
-- (DROP COLUMN) is Class C - human-only, never autonomous. Production applies only through the
-- gated `prisma migrate deploy` workflow.

ALTER TABLE "email_mailboxes" ADD COLUMN "syncSentCursor" TEXT;