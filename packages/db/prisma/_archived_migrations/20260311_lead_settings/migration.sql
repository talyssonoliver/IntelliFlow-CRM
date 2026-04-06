-- CreateTable
CREATE TABLE "lead_stage_configs" (
    "id" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "lead_stage_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_scoring_rules" (
    "id" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "lead_scoring_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_custom_fields" (
    "id" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "options" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "lead_custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_automation_settings" (
    "id" TEXT NOT NULL,
    "autoAssignment" BOOLEAN NOT NULL DEFAULT true,
    "instantNotifications" BOOLEAN NOT NULL DEFAULT false,
    "leadRecurrence" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "lead_automation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_stage_configs_tenantId_idx" ON "lead_stage_configs"("tenantId");
CREATE INDEX "lead_stage_configs_sortOrder_idx" ON "lead_stage_configs"("sortOrder");
CREATE UNIQUE INDEX "lead_stage_configs_tenantId_stageKey_key" ON "lead_stage_configs"("tenantId", "stageKey");

-- CreateIndex
CREATE INDEX "lead_scoring_rules_tenantId_idx" ON "lead_scoring_rules"("tenantId");
CREATE UNIQUE INDEX "lead_scoring_rules_tenantId_activityType_key" ON "lead_scoring_rules"("tenantId", "activityType");

-- CreateIndex
CREATE INDEX "lead_custom_fields_tenantId_idx" ON "lead_custom_fields"("tenantId");
CREATE UNIQUE INDEX "lead_custom_fields_tenantId_fieldKey_key" ON "lead_custom_fields"("tenantId", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "lead_automation_settings_tenantId_key" ON "lead_automation_settings"("tenantId");

-- AddForeignKey
ALTER TABLE "lead_stage_configs" ADD CONSTRAINT "lead_stage_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_scoring_rules" ADD CONSTRAINT "lead_scoring_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_custom_fields" ADD CONSTRAINT "lead_custom_fields_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_automation_settings" ADD CONSTRAINT "lead_automation_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
