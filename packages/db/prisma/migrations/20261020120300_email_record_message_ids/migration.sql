-- PG-207: email_records gets the mailbox it was sent from and the ids used to
-- match bounce reports back to it (ADR-085).
--
-- Class A: additive only on a populated table.
--   * Four NULLABLE columns with no default: metadata-only in PostgreSQL 11+,
--     no table rewrite; existing rows read NULL.
--   * The foreign key is added NOT VALID (no scan under the ADD lock) and then
--     VALIDATEd, which takes only a SHARE UPDATE EXCLUSIVE lock and does not
--     block reads or writes. Every existing value is NULL, so validation cannot
--     fail.
--   * The ("tenantId", "messageIdHeader") index ships CONCURRENTLY in
--     20261020120400 (it cannot run inside this migration's transaction).
--
-- Recovery plan: forward-only; the columns are nullable and ignored by older
-- code. Dropping them is Class C — human-only.

ALTER TABLE "email_records" ADD COLUMN "mailboxId" TEXT,
ADD COLUMN "messageIdHeader" VARCHAR(255),
ADD COLUMN "provider" VARCHAR(12),
ADD COLUMN "providerMessageId" VARCHAR(255);

ALTER TABLE "email_records" ADD CONSTRAINT "email_records_provider_check"
    CHECK ("provider" IS NULL OR "provider" IN ('SMTP', 'GMAIL', 'MICROSOFT')) NOT VALID;
ALTER TABLE "email_records" VALIDATE CONSTRAINT "email_records_provider_check";

ALTER TABLE "email_records" ADD CONSTRAINT "email_records_mailboxId_fkey"
    FOREIGN KEY ("mailboxId") REFERENCES "email_mailboxes"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "email_records" VALIDATE CONSTRAINT "email_records_mailboxId_fkey";
