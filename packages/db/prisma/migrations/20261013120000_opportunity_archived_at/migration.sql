-- #421: Deal detail Archive backend (IFC-280 deferred).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * opportunities: one NULLABLE column with no default -> metadata-only on
--     PG 11+, no table rewrite, no backfill, every existing row stays NULL
--     (not archived) and no existing row changes.
--   * No new index: archive/unarchive is a low-cardinality admin action, not a
--     hot filter path yet. A future list/filter-by-archived feature adds its
--     own index against real query shapes rather than guessing one here.
--
-- Recovery plan: forward-only. Operational rollback = stop calling
-- opportunity.archive/unarchive; nothing else reads this column. A
-- down-migration (DROP COLUMN) is Class C — human-only, never run autonomously.
--
-- Production applies only through the gated `prisma migrate deploy` workflow.

ALTER TABLE "opportunities" ADD COLUMN "archivedAt" TIMESTAMP(3);
