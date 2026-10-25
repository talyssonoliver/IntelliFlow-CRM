-- PG-203: unique public booking handle per firm (ADR-083).
--
-- Class A: CREATE UNIQUE INDEX CONCURRENTLY never blocks writes on "tenants", which every request reads.
-- It cannot run inside a transaction, so it is the only statement in this migration; Prisma runs
-- single-statement migrations without wrapping them (precedent: 20261017120100_contacts_type_idx).
-- Every row's "bookingHandle" is NULL and NULLs never collide, so the build cannot fail on existing data.
-- IF NOT EXISTS makes a retry safe once an operator has dropped an INVALID index left by a failed build.
--
-- Recovery plan: forward-only; the index can be dropped (DROP INDEX CONCURRENTLY) with no data effect.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "tenants_bookingHandle_key" ON "tenants"("bookingHandle");
