-- IFC-314: explicit Stripe customer link on opportunities, for setup-fee invoicing.
-- Resolution chain (resolveStripeCustomerId): opportunities.stripeCustomerId →
-- deal-owner User.stripeCustomerId → create-at-deal-won (stamped back here).
-- Additive + nullable: no backfill, no data loss.
ALTER TABLE "opportunities" ADD COLUMN "stripeCustomerId" TEXT;
