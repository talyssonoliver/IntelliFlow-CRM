-- Mail look-back pacing (customer issue #58): a big import never bursts Gmail, a refusal waits.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only. Five columns on
-- "email_mailboxes" (four nullable, one with a constant default) and one on "email_oauth_states"
-- (constant default); no row is read or changed, no constraint, index or RLS change.
--   "lookbackNextAt":      the look-back does not start another round before this time (null: no wait).
--                          Set after each finished batch (pacing) and after a provider RATE_LIMITED.
--   "lookbackBackoffCount": consecutive rate-limited rounds; the wait doubles with it, reset on progress.
--   "lookbackProgressAt":  the last time the look-back made progress (null: not yet); a mailbox
--                          with a backlog and no progress for 6 h or more alerts the owner, per tenant.
--   "lookbackImportTotal", "lookbackImportDone": real counts for the settings page
--                          ("Importing email history: 40 of 163 contacts"); null total: nothing importing.
--   "email_oauth_states"."acceptPersonal": the user confirmed a personal (consumer-domain) mailbox
--                          before the sign-in started.
--
-- Recovery plan: forward-only; unset columns change nothing. A down-migration (DROP COLUMN) is
-- Class C - human-only, never autonomous. Production applies only through the gated
-- `prisma migrate deploy` workflow, after the owner's yes.

ALTER TABLE "email_mailboxes"
  ADD COLUMN "lookbackNextAt" TIMESTAMP(3),
  ADD COLUMN "lookbackBackoffCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lookbackProgressAt" TIMESTAMP(3),
  ADD COLUMN "lookbackImportTotal" INTEGER,
  ADD COLUMN "lookbackImportDone" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "email_oauth_states"
  ADD COLUMN "acceptPersonal" BOOLEAN NOT NULL DEFAULT false;
