-- PG-200: Add report_templates table
-- Saveable report layouts per tenant (filter set + columns + chart type + period + sharing scope)

CREATE TABLE "report_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filterSet" JSONB NOT NULL DEFAULT '{}',
    "selectedColumns" JSONB NOT NULL,
    "chartType" TEXT NOT NULL DEFAULT 'table',
    "defaultPeriod" TEXT NOT NULL DEFAULT '30d',
    "sharingScope" TEXT NOT NULL DEFAULT 'private',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_templates_tenantId_name_key" ON "report_templates"("tenantId", "name");

CREATE INDEX "report_templates_tenantId_idx" ON "report_templates"("tenantId");

CREATE INDEX "report_templates_createdBy_idx" ON "report_templates"("createdBy");

ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_templates" ENABLE ROW LEVEL SECURITY;
