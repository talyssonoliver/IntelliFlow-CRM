-- MVP-013: scope a calendar link to the Google account it was made under.
--
-- Class A in effect (ADR-069 / docs/operations/agent-autonomy-policy.md), with one deliberate step beyond
-- pure additive, flagged for the SQL reviewer: one defaulted column is added, and the unique key on
-- (mailboxId, googleEventId) is widened to (mailboxId, googleAccount, googleEventId).
--
--   * ADD COLUMN ... NOT NULL DEFAULT '': a constant default, so Postgres rewrites nothing.
--   * The new unique index is built before the old one is dropped. Nothing in production has ever
--     written this table: the sync tick that writes it ships with this change (main has no caller of
--     runCalendarSync), so both index builds run over an empty table and take no meaningful lock. The
--     widened key is strictly weaker than the old one, so no existing row can violate it.
--   * No row is read, rewritten or deleted. The table holds no credential.
--
-- Why: after a switch from Google account A to B and back to A, A's links must still be there, or A's
-- events are imported a second time and Aurora's appointments are exported again as new events. Google's
-- event ids are unique per calendar, not across accounts, so the key must name the account.
--
-- Recovery plan: forward-only. Operational rollback = GOOGLE_CALENDAR_SYNC=off; the column is simply
-- unused. A down-migration (restoring the old unique key, DROP COLUMN) is Class C - human-only, never
-- autonomous.
-- Production applies only through the gated `prisma migrate deploy` workflow, before the API that
-- reads this column is promoted.

ALTER TABLE "calendar_event_links" ADD COLUMN "googleAccount" VARCHAR(320) NOT NULL DEFAULT '';

CREATE UNIQUE INDEX "calendar_event_links_mailboxId_googleAccount_googleEventId_key"
    ON "calendar_event_links"("mailboxId", "googleAccount", "googleEventId");

DROP INDEX "calendar_event_links_mailboxId_googleEventId_key";
