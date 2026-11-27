-- MVP-013: widen "email_mailboxes"."oauthAccountId" to hold a Google account id.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive and backward-compatible.
-- The column held a Zoho account id (at most 64 characters) and now also holds Google's immutable
-- account id (the OpenID `sub`, up to 255 ASCII characters). Raising a VARCHAR limit is a catalogue-only
-- change in PostgreSQL 9.2+: no table rewrite, no row is read or changed, no index touches the column, and
-- every value that fits today still fits. Old application code keeps working against the wider column.
--
-- Recovery plan: forward-only. Operational rollback = GOOGLE_CALENDAR_SYNC=off; the wider limit is simply
-- unused. A down-migration (narrowing the column) is Class C - human-only, never autonomous.
-- Production applies only through the gated `prisma migrate deploy` workflow, before the API that
-- stores the longer id is promoted.

ALTER TABLE "email_mailboxes" ALTER COLUMN "oauthAccountId" TYPE VARCHAR(255);
