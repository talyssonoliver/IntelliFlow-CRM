-- CreateEnum
CREATE TYPE "StripeSubscriptionStatus" AS ENUM ('INCOMPLETE', 'INCOMPLETE_EXPIRED', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'PAUSED');

-- CreateTable
CREATE TABLE "stripe_subscriptions" (
    "id" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "status" "StripeSubscriptionStatus" NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "tenantSlug" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stripe_subscriptions_stripeSubscriptionId_key" ON "stripe_subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "stripe_subscriptions_tenantId_idx" ON "stripe_subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "stripe_subscriptions_stripeCustomerId_idx" ON "stripe_subscriptions"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "stripe_subscriptions_tenantSlug_idx" ON "stripe_subscriptions"("tenantSlug");

-- CreateIndex
CREATE INDEX "stripe_subscriptions_status_idx" ON "stripe_subscriptions"("status");

