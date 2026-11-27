-- Register #64 (owner decision 26/11/2026): personal mail is private.
--
-- email_records.mailboxId is ON DELETE SET NULL, and a user's mailbox is deleted with the user
-- (ON DELETE CASCADE) or when they disconnect it. Mail with no mailbox and no owner reads as
-- "shared inbound mail" to the visibility policy, so deleting a personal mailbox would turn its
-- mail into tenant-wide mail. This keeps the owner: just before a USER mailbox is deleted, its
-- mail is stamped with `metadata.mailboxOwnerId`, which the policy reads for mail with no mailbox
-- (synced mail already carries it). A TENANT mailbox needs nothing: its mail stays shared.
--
-- Recovery plan: forward-only and reversible without data loss: DROP TRIGGER
-- email_mailboxes_keep_mail_owner ON email_mailboxes; DROP FUNCTION email_mailbox_keep_mail_owner();
-- (stamped metadata keys are harmless and may stay).
--
-- Merged, NOT applied: production applies only through the gated `prisma migrate deploy` workflow.

CREATE OR REPLACE FUNCTION email_mailbox_keep_mail_owner() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD."scope" = 'USER' AND OLD."userId" IS NOT NULL THEN
    UPDATE email_records
    SET metadata = COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object('mailboxOwnerId', OLD."userId")
    WHERE "mailboxId" = OLD."id"
      AND "tenantId" = OLD."tenantId"
      AND (metadata IS NULL
        OR (jsonb_typeof(metadata) = 'object' AND metadata ->> 'mailboxOwnerId' IS NULL));
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER email_mailboxes_keep_mail_owner
  BEFORE DELETE ON email_mailboxes
  FOR EACH ROW EXECUTE FUNCTION email_mailbox_keep_mail_owner();
