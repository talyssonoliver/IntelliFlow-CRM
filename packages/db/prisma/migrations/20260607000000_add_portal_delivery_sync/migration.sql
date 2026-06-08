-- IFC-314: Leangency portal delivery & billing sync.
-- Adds the Setup-fee instalment model (3x at day 0/7/14) + DeliveryTier + the
-- target portal tenant slug on Opportunity. The portal owns delivery state; the
-- CRM mirrors billing.

-- CreateEnum
CREATE TYPE "DeliveryTier" AS ENUM ('CORE', 'PREMIUM', 'PILOT');

-- CreateEnum
CREATE TYPE "SetupInstalmentStatus" AS ENUM ('DUE', 'PAID', 'OVERDUE');

-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN     "deliveryTier" "DeliveryTier",
ADD COLUMN     "tenantSlug" TEXT;

-- CreateTable
CREATE TABLE "setup_instalments" (
    "id" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "status" "SetupInstalmentStatus" NOT NULL DEFAULT 'DUE',
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "stripeInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "setup_instalments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "setup_instalments_stripeInvoiceId_key" ON "setup_instalments"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "setup_instalments_opportunityId_idx" ON "setup_instalments"("opportunityId");

-- CreateIndex
CREATE INDEX "setup_instalments_tenantId_idx" ON "setup_instalments"("tenantId");

-- CreateIndex
CREATE INDEX "setup_instalments_status_idx" ON "setup_instalments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "setup_instalments_opportunityId_n_key" ON "setup_instalments"("opportunityId", "n");

-- AddForeignKey
ALTER TABLE "setup_instalments" ADD CONSTRAINT "setup_instalments_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setup_instalments" ADD CONSTRAINT "setup_instalments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
