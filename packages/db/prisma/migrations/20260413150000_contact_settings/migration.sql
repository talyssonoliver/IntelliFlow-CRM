-- PG-182 Contact Settings — duplicate rules, required fields, tags, automation.

-- CreateTable
CREATE TABLE "contact_duplicate_rules" (
    "id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "matchStrategy" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "contact_duplicate_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_required_fields" (
    "id" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "contact_required_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorToken" TEXT NOT NULL DEFAULT 'slate',
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_automation_settings" (
    "id" TEXT NOT NULL,
    "autoMergeOnExactEmail" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnDuplicate" BOOLEAN NOT NULL DEFAULT true,
    "restrictTagCreationToAdmins" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "contact_automation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contact_duplicate_rules_tenantId_field_matchStrategy_key"
    ON "contact_duplicate_rules"("tenantId", "field", "matchStrategy");
CREATE INDEX "contact_duplicate_rules_tenantId_idx" ON "contact_duplicate_rules"("tenantId");

CREATE UNIQUE INDEX "contact_required_fields_tenantId_fieldKey_key"
    ON "contact_required_fields"("tenantId", "fieldKey");
CREATE INDEX "contact_required_fields_tenantId_idx" ON "contact_required_fields"("tenantId");

CREATE UNIQUE INDEX "contact_tags_tenantId_name_key"
    ON "contact_tags"("tenantId", "name");
CREATE INDEX "contact_tags_tenantId_idx" ON "contact_tags"("tenantId");

CREATE UNIQUE INDEX "contact_automation_settings_tenantId_key"
    ON "contact_automation_settings"("tenantId");

-- AddForeignKey
ALTER TABLE "contact_duplicate_rules"
    ADD CONSTRAINT "contact_duplicate_rules_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_required_fields"
    ADD CONSTRAINT "contact_required_fields_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_tags"
    ADD CONSTRAINT "contact_tags_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_automation_settings"
    ADD CONSTRAINT "contact_automation_settings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
