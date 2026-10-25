-- PG-207: index "email_records"("mailboxId"), the column of the ON DELETE SET
-- NULL foreign key to "email_mailboxes" (ADR-085). Without it every mailbox
-- delete (and user / tenant cascade) scans "email_records".
--
-- Class A: CREATE INDEX CONCURRENTLY never blocks writes. It cannot run inside
-- a transaction, so it is the only statement in this migration (precedent:
-- 20261017120100_contacts_type_idx). IF NOT EXISTS makes a retry safe once an
-- operator has dropped an INVALID index left by a failed build; after deploy,
-- confirm pg_index.indisvalid for this index.
--
-- Recovery plan: forward-only; the index is read-only and can be dropped
-- (DROP INDEX CONCURRENTLY) with no data effect.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "email_records_mailboxId_idx"
    ON "email_records"("mailboxId");
