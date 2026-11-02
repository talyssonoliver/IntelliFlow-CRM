-- PG-207: email_records gets the mailbox it was sent from and the ids used to
-- match bounce reports back to it (ADR-085).
--
-- Class A: additive only on a populated table.
--   * Four NULLABLE columns with no default: metadata-only in PostgreSQL 11+,
--     no table rewrite; existing rows read NULL.
--   * Both constraints are added NOT VALID, so this migration never scans
--     "email_records". Prisma runs a multi-statement migration as one
--     transaction, so the ADD COLUMN's ACCESS EXCLUSIVE lock is held to the
--     end of this file: that is why validation is NOT done here. Each
--     VALIDATE ships as its own single-statement migration (20261020120310,
--     20261020120320), where it takes only SHARE UPDATE EXCLUSIVE and does not
--     block reads or writes.
--   * lock_timeout bounds the wait for the ACCESS EXCLUSIVE lock: behind a
--     long-running transaction the migration fails fast (and is retried)
--     instead of queueing every other query on "email_records" behind it.
--   * The indexes ship CONCURRENTLY in 20261020120400 and 20261020120500.
--
-- Recovery plan: forward-only; the columns are nullable and ignored by older
-- code. Dropping them is Class C — human-only.

SET lock_timeout = '5s';

ALTER TABLE "email_records" ADD COLUMN "mailboxId" TEXT,
ADD COLUMN "messageIdHeader" VARCHAR(255),
ADD COLUMN "provider" VARCHAR(12),
ADD COLUMN "providerMessageId" VARCHAR(255);

ALTER TABLE "email_records" ADD CONSTRAINT "email_records_provider_check"
    CHECK ("provider" IS NULL OR "provider" IN ('SMTP', 'GMAIL', 'MICROSOFT')) NOT VALID;

ALTER TABLE "email_records" ADD CONSTRAINT "email_records_mailboxId_fkey"
    FOREIGN KEY ("mailboxId") REFERENCES "email_mailboxes"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

RESET lock_timeout;
