-- MVP-011: remember how far each mailbox has looked back for mail with leads and contacts.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only. Four nullable
-- columns on "email_mailboxes"; no row is read or changed, no constraint, index or RLS change.
-- The mailbox sync reads only what arrives after a mailbox is connected, so mail from before it,
-- and mail with a lead or contact created after it was read, never reached the CRM. The look-back
-- (apps/api/src/modules/email/mail-sync-lookback.ts) reads the last 90 days of a mailbox for the
-- leads and contacts created since it last looked:
--   "lookbackWatermark": leads and contacts created up to this time have been looked for (null: none yet)
--   "lookbackUntil":     a pass in progress covers leads and contacts created up to here (null: idle)
--   "lookbackCursor", "lookbackSentCursor": where the pass resumes in the Inbox and in Sent Items
-- Every column starts null, which means "never looked": the first tick after the code ships
-- starts a pass for each readable mailbox. Mail already logged is never logged twice (the
-- provider message id and the Message-ID header are the keys).
--
-- Recovery plan: forward-only; unset columns change nothing (a pass is simply not in progress).
-- A down-migration (DROP COLUMN) is Class C - human-only, never autonomous. Production applies
-- only through the gated `prisma migrate deploy` workflow, after the owner's yes.

ALTER TABLE "email_mailboxes"
  ADD COLUMN "lookbackWatermark" TIMESTAMP(3),
  ADD COLUMN "lookbackUntil" TIMESTAMP(3),
  ADD COLUMN "lookbackCursor" TEXT,
  ADD COLUMN "lookbackSentCursor" TEXT;
