-- MVP-014: index the "who is waiting" read of sent mail, newest first, per tenant.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only. One index on
-- "email_records"; no column, row, constraint or RLS change. The waiting loader reads
-- WHERE "tenantId" = $1 AND "sentAt" IS NOT NULL ORDER BY "sentAt" DESC LIMIT n, which the
-- existing ("tenantId", "createdAt" DESC) index cannot order. The sentAt IS NULL stream orders by
-- createdAt and is already covered by that index.
--
-- Recovery plan: forward-only; an unused index changes no result. A down-migration
-- (DROP INDEX "email_records_tenantId_sentAt_idx") is Class C - human-only, never autonomous.
-- Production applies only through the gated `prisma migrate deploy` workflow, after the owner's yes.

CREATE INDEX "email_records_tenantId_sentAt_idx" ON "email_records"("tenantId", "sentAt" DESC);
