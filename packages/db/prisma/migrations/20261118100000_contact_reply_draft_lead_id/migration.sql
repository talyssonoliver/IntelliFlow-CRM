-- MVP-012: a reply Aurora drafts can belong to a lead as well as to a contact.
-- Enquiries arrive as leads (owner promise to West London Handyman, 18/11/2026), so a draft
-- for one must wait on the lead itself, not only on a contact.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive and widening only.
-- The owner said yes to this migration (modal, 18/11/2026).
--   * One nullable column on "contact_reply_drafts": "leadId", the lead the draft answers. It
--     has an index for the lead's Emails tab and a foreign key (cascade, like "contactId").
--     The foreign key is added NOT VALID, with no table scan; every row has a null "leadId", so
--     nothing can fail it. The next migration validates it.
--   * "contactId" drops NOT NULL. Every row allowed before is still allowed.
--   * One new CHECK: a draft belongs to exactly one of a contact or a lead. It is added NOT
--     VALID, so nothing is scanned here. Every existing row has a "contactId" and no "leadId",
--     so it passes; the next migration validates it under a SHARE UPDATE EXCLUSIVE lock only.
--   * No data is read, rewritten or deleted, and RLS does not change. The table's
--     tenant_isolation policy is on "tenantId" and still covers every row.
--
-- Recovery plan: forward-only. Operational rollback means no code writes "leadId", so the
-- column stays null and every draft is a contact's, exactly as before. Making "contactId" NOT
-- NULL again, or dropping the column, is Class C: human-only, never autonomous.
-- If this file fails it rolls back whole (one transaction) and `prisma migrate deploy` stops.
-- Fix the cause, run `prisma migrate resolve --rolled-back 20261118100000_contact_reply_draft_lead_id`,
-- then deploy again.
--
-- Production applies only through the gated `prisma migrate deploy` workflow, from merged
-- main, before the API that writes lead drafts is promoted.

SET lock_timeout = '5s';

ALTER TABLE "contact_reply_drafts" ADD COLUMN "leadId" TEXT;

ALTER TABLE "contact_reply_drafts" ALTER COLUMN "contactId" DROP NOT NULL;

ALTER TABLE "contact_reply_drafts"
  ADD CONSTRAINT "contact_reply_drafts_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id")
  ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "contact_reply_drafts"
  ADD CONSTRAINT "contact_reply_drafts_one_subject_check"
  CHECK (("contactId" IS NULL) <> ("leadId" IS NULL)) NOT VALID;

CREATE INDEX "contact_reply_drafts_leadId_status_idx" ON "contact_reply_drafts" ("leadId", "status");

RESET lock_timeout;
