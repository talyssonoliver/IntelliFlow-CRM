-- Add the Stripe-hosted payment page URL to setup-fee instalments, so the CRM can
-- push it to the Leangency portal and the client can pay a due/overdue instalment.
-- Additive + nullable: backfills to NULL, no rewrite, safe online.
ALTER TABLE "setup_instalments" ADD COLUMN "hostedInvoiceUrl" TEXT;
