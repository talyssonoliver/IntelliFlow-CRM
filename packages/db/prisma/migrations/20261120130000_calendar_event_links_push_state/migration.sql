-- MVP-013: the Google Calendar push - what a link needs to remember about writing its event.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only. Three columns added to
-- "calendar_event_links": a BOOLEAN and an INTEGER with constant defaults (false and 0), and one
-- nullable timestamp. Postgres adds a constant default without rewriting the table, and no existing row
-- is read or changed. No index, no constraint, no data written. The table holds no credential.
--
--   * "pending": the link is written before the event is created in Google, so an event Aurora is
--     still linking is known to be Aurora's (and not imported a second time), and a lost answer
--     cannot leave an appointment unlinked.
--   * "pushAttempts" / "nextPushAt": a create or patch that Google refuses is retried later and
--     less often, instead of being selected again every round and holding up everything behind it.
--
-- Recovery plan: forward-only. Operational rollback = the sync is switched off with
-- GOOGLE_CALENDAR_SYNC=off and the columns are simply unused. A down-migration (DROP COLUMN) is
-- Class C - human-only, never autonomous.
--
-- Production applies only through the gated `prisma migrate deploy` workflow, before the API that
-- reads these columns is promoted.

ALTER TABLE "calendar_event_links"
    ADD COLUMN "pending" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "pushAttempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "nextPushAt" TIMESTAMP(3);
