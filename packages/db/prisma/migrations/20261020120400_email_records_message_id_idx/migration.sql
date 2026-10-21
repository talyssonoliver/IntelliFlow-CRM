-- PG-207: index the bounce reader uses to find the email a bounce report
-- refers to (ADR-085).
--
-- Class A: CREATE INDEX CONCURRENTLY never blocks writes on "email_records". It
-- cannot run inside a transaction, so it is the only statement in this
-- migration; Prisma runs single-statement migrations without wrapping them
-- (precedent: 20261017120100_contacts_type_idx). IF NOT EXISTS makes a retry
-- safe once an operator has dropped an INVALID index left by a failed build.
--
-- Recovery plan: forward-only; the index is read-only and can be dropped
-- (DROP INDEX CONCURRENTLY) with no data effect.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "email_records_tenantId_messageIdHeader_idx"
    ON "email_records"("tenantId", "messageIdHeader");
