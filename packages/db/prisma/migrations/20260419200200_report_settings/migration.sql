-- PG-187 Report Settings (landed alongside PG-190 to unblock typecheck).

CREATE TABLE "report_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "defaultRange" TEXT NOT NULL DEFAULT '30d',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "scheduledDelivery" JSONB NOT NULL DEFAULT '{"enabled":false,"frequency":"weekly","dayOfWeek":1,"time":"09:00","recipients":[],"format":"pdf"}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_settings_tenantId_key" ON "report_settings"("tenantId");

ALTER TABLE "report_settings"
    ADD CONSTRAINT "report_settings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_settings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_settings_tenant_isolation" ON "report_settings"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));
