-- PG-205: index for the contacts type filter, the sidebar segments and the
-- "type in use" count (ADR-080).
--
-- Class A: CREATE INDEX CONCURRENTLY never blocks writes on "contacts". It cannot
-- run inside a transaction, so it is the only statement in this migration;
-- Prisma runs single-statement migrations without wrapping them (precedent:
-- 20261016120100_agent_actions_pending_sweep_idx). IF NOT EXISTS makes a retry
-- safe once an operator has dropped an INVALID index left by a failed build.
--
-- Recovery plan: forward-only; the index is read-only and can be dropped
-- (DROP INDEX CONCURRENTLY) with no data effect.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "contacts_tenantId_contactType_idx"
    ON "contacts"("tenantId", "contactType");
