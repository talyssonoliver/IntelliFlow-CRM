-- MVP-012 (register #49 follow-up): store the confidence of a lead's AI score.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive and backward-compatible.
-- One nullable column, no default, no index, no backfill. Adding a nullable column without a default is a
-- catalogue-only change in PostgreSQL: no table rewrite, no row is read or changed. Old application code
-- never selects or writes it, so it keeps working against the new column. NULL means "unknown": a lead scored
-- before this column existed gets a value on its next scoring.
--
-- Recovery plan: forward-only. Operational rollback = ignore the column (the UI treats NULL as unknown).
-- Dropping the column is Class C - human-only, never autonomous.
-- Production applies only through the gated `prisma migrate deploy` workflow, before the API and the
-- worker that write the column are promoted.

ALTER TABLE "leads" ADD COLUMN "scoreConfidence" DOUBLE PRECISION;
