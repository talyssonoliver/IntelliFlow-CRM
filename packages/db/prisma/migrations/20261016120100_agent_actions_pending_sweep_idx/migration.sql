-- PG-198: index for the approval escalation sweep (ADR-079).
--
-- Class A: CREATE INDEX CONCURRENTLY never blocks writes on "agent_actions"
-- (production size unknown). It cannot run inside a transaction, so it is the
-- only statement in this migration; Prisma runs single-statement migrations
-- without wrapping them. IF NOT EXISTS makes a retry after a failed concurrent
-- build safe once the invalid index has been dropped by an operator.
--
-- Recovery plan: forward-only; the index is read-only for the sweep and can be
-- dropped (DROP INDEX CONCURRENTLY) with no data effect.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_actions_pending_sweep_idx"
    ON "agent_actions"("tenantId", "createdAt")
    WHERE "status" = 'PENDING_APPROVAL';
