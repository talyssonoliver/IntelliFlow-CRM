-- MVP-013: scope a calendar link to the Google account it was made under.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only. One nullable column on
-- "calendar_event_links" (no default, so Postgres rewrites nothing). No row is read or changed here and
-- there is no backfill: a link with no account counts as the active account's, and the sync stamps it with
-- the account it belonged to when the mailbox is switched to another. No index: every read is already
-- bounded by the ("mailboxId", ...) unique indexes, a mailbox holds few links, and a blocking index
-- build is not Class A (a CONCURRENTLY one would add nothing here).
--
-- Why: after a switch from Google account A to B and back to A, the links of A must still be there, or
-- A's events are imported a second time and Aurora's appointments are exported again as new events.
--
-- Recovery plan: forward-only. Operational rollback = GOOGLE_CALENDAR_SYNC=off; the column is simply
-- unused. A down-migration (DROP COLUMN) is Class C - human-only, never autonomous.
-- Production applies only through the gated `prisma migrate deploy` workflow, before the API that
-- reads this column is promoted.

ALTER TABLE "calendar_event_links" ADD COLUMN "googleAccount" VARCHAR(320);
