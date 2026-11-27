-- MVP-012: store who wrote a ticket activity, so Tickets can filter to "My activity".
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only. One nullable
-- column on "ticket_activities" plus one small index; no row is read or changed, no NOT NULL,
-- no backfill, no constraint, no RLS change.
-- Ticket activity stored only "authorName" (a display name), which cannot be matched to a user
-- reliably. "authorId" holds the id of the user who wrote the entry (null: customer, system or
-- an entry written before this column existed). The code that writes and filters on it ships in
-- a separate PR. A backfill from "authorName" is NOT part of this migration (Class B, separate).
-- The index serves the "My activity" filter (a tenant's entries by one author, newest first).
--
-- Recovery plan: forward-only; a null column changes nothing. A down-migration (DROP COLUMN,
-- DROP INDEX) is Class C - human-only, never autonomous. Production applies only through the
-- gated `prisma migrate deploy` workflow, after the owner's yes.

ALTER TABLE "ticket_activities"
  ADD COLUMN "authorId" TEXT;

CREATE INDEX "ticket_activities_tenantId_authorId_timestamp_idx"
  ON "ticket_activities"("tenantId", "authorId", "timestamp" DESC);
