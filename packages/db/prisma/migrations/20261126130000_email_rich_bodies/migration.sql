-- Rich email bodies and attachment metadata (lead email thread review, 26/11/2026).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only. One nullable column
-- on "email_records" and three on "email_attachments" (two nullable, one with a constant default);
-- no row is read or changed, no constraint, index or RLS change.
--   "email_records"."bodyHtml":                the provider's HTML body, sanitised server-side at
--                                              write time; null for plain-text mail ("body" stays
--                                              the text fallback).
--   "email_attachments"."providerAttachmentId": where the provider can be asked for the file.
--   "email_attachments"."contentId":           the Content-ID an inline image is referenced by (cid:).
--   "email_attachments"."isInline":            inline image rather than a file.
-- Attachments synced from a provider keep only this metadata ("fileUrl" is ''): the file is not
-- copied into Aurora, it is fetched from the provider on demand and never stored.
--
-- Recovery plan: forward-only; unset columns change nothing. A down-migration (DROP COLUMN) is
-- Class C - human-only, never autonomous. Production applies only through the gated
-- `prisma migrate deploy` workflow, after the owner's yes.

ALTER TABLE "email_records"
  ADD COLUMN "bodyHtml" TEXT;

ALTER TABLE "email_attachments"
  ADD COLUMN "providerAttachmentId" VARCHAR(512),
  ADD COLUMN "contentId" VARCHAR(255),
  ADD COLUMN "isInline" BOOLEAN NOT NULL DEFAULT false;
