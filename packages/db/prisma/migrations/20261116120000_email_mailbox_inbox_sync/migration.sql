-- #1177: Outlook / Microsoft 365 two-way sync - the per-mailbox inbox sync cursor.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * Five columns added to "email_mailboxes": four nullable, one integer with a constant
--     default (0). Postgres adds a constant default without rewriting the table, and no
--     existing row is read or changed.
--   * No constraint, index or RLS policy changes: the table's existing policies cover them.
--   * "syncCursor" holds Graph's delta link, which is useless without the mailbox's own
--     access token (never stored); it is not a credential.
--
-- Recovery plan: forward-only. Operational rollback = the sync tick is disabled with
-- EMAIL_INBOX_SYNC=off (or EMAIL_INBOX_SYNC_INTERVAL_MS=0) and the columns are simply unused. A down-migration (DROP COLUMN)
-- is Class C - human-only, never autonomous.
--
-- Production applies only through the gated `prisma migrate deploy` workflow, before the API
-- that reads these columns is promoted.

ALTER TABLE "email_mailboxes"
    ADD COLUMN "syncCursor" TEXT,
    ADD COLUMN "syncedAt" TIMESTAMP(3),
    ADD COLUMN "nextSyncAt" TIMESTAMP(3),
    ADD COLUMN "syncLockedUntil" TIMESTAMP(3),
    ADD COLUMN "syncFailureCount" INTEGER NOT NULL DEFAULT 0;