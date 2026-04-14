-- Add Multi-Tenancy Support
-- This migration adds the Tenant model and tenantId to all CRM entities

-- Step 1: Create TenantStatus enum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TRIAL');

-- Step 2: Create tenants table
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- Step 3: Create indexes on tenants table
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE INDEX "tenants_slug_idx" ON "tenants"("slug");
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- Step 4: Insert default tenant
INSERT INTO "tenants" ("id", "name", "slug", "status", "createdAt", "updatedAt")
VALUES (
    'default-tenant-' || substr(md5(random()::text), 1, 16),
    'Default Organization',
    'default',
    'ACTIVE',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Step 5: Get the default tenant ID for use in subsequent steps
DO $$
DECLARE
    default_tenant_id TEXT;
BEGIN
    SELECT id INTO default_tenant_id FROM "tenants" WHERE slug = 'default';

    -- Step 6: Add tenantId to users table
    ALTER TABLE "users" ADD COLUMN "tenantId" TEXT;
    UPDATE "users" SET "tenantId" = default_tenant_id;
    ALTER TABLE "users" ALTER COLUMN "tenantId" SET NOT NULL;
    CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");
    ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- Step 7: Add tenantId to leads table
    ALTER TABLE "leads" ADD COLUMN "tenantId" TEXT;
    UPDATE "leads" SET "tenantId" = default_tenant_id;
    ALTER TABLE "leads" ALTER COLUMN "tenantId" SET NOT NULL;
    CREATE INDEX "leads_tenantId_idx" ON "leads"("tenantId");
    ALTER TABLE "leads" ADD CONSTRAINT "leads_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- Step 8: Add tenantId to contacts table
    ALTER TABLE "contacts" ADD COLUMN "tenantId" TEXT;
    UPDATE "contacts" SET "tenantId" = default_tenant_id;
    ALTER TABLE "contacts" ALTER COLUMN "tenantId" SET NOT NULL;
    CREATE INDEX "contacts_tenantId_idx" ON "contacts"("tenantId");
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- Step 9: Add tenantId to accounts table
    ALTER TABLE "accounts" ADD COLUMN "tenantId" TEXT;
    UPDATE "accounts" SET "tenantId" = default_tenant_id;
    ALTER TABLE "accounts" ALTER COLUMN "tenantId" SET NOT NULL;
    CREATE INDEX "accounts_tenantId_idx" ON "accounts"("tenantId");
    ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- Step 10: Add tenantId to opportunities table
    ALTER TABLE "opportunities" ADD COLUMN "tenantId" TEXT;
    UPDATE "opportunities" SET "tenantId" = default_tenant_id;
    ALTER TABLE "opportunities" ALTER COLUMN "tenantId" SET NOT NULL;
    CREATE INDEX "opportunities_tenantId_idx" ON "opportunities"("tenantId");
    ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- Step 11: Add tenantId to tasks table
    ALTER TABLE "tasks" ADD COLUMN "tenantId" TEXT;
    UPDATE "tasks" SET "tenantId" = default_tenant_id;
    ALTER TABLE "tasks" ALTER COLUMN "tenantId" SET NOT NULL;
    CREATE INDEX "tasks_tenantId_idx" ON "tasks"("tenantId");
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- Step 12: Add tenantId to tickets table
    ALTER TABLE "tickets" ADD COLUMN "tenantId" TEXT;
    UPDATE "tickets" SET "tenantId" = default_tenant_id;
    ALTER TABLE "tickets" ALTER COLUMN "tenantId" SET NOT NULL;
    CREATE INDEX "tickets_tenantId_idx" ON "tickets"("tenantId");
    ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- Step 13: Add tenantId to audit_log_entries table
    ALTER TABLE "audit_log_entries" ADD COLUMN "tenantId" TEXT;
    UPDATE "audit_log_entries" SET "tenantId" = default_tenant_id;
    ALTER TABLE "audit_log_entries" ALTER COLUMN "tenantId" SET NOT NULL;
    CREATE INDEX "audit_log_entries_tenantId_idx" ON "audit_log_entries"("tenantId");
    ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

END $$;
