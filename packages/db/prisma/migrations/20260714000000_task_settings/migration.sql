-- PG-191 Task Settings (per-tenant task defaults: due-date offset, reminder
-- defaults, task-template config). Singleton per tenant.

CREATE TABLE "task_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dueDateOffsetDays" INTEGER NOT NULL DEFAULT 3,
    "reminderDefaults" JSONB NOT NULL DEFAULT '{"enabled":true,"minutesBefore":60}',
    "taskTemplates" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_settings_tenantId_key" ON "task_settings"("tenantId");

ALTER TABLE "task_settings"
    ADD CONSTRAINT "task_settings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_settings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_settings_tenant_isolation" ON "task_settings"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));
