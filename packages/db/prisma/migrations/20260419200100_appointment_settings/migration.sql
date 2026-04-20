-- PG-189 Appointment Settings (landed alongside PG-190 to unblock typecheck).

CREATE TABLE "appointment_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "minDurationMinutes" INTEGER NOT NULL DEFAULT 5,
    "maxDurationMinutes" INTEGER NOT NULL DEFAULT 480,
    "defaultBufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "defaultBufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "defaultReminderMinutes" INTEGER DEFAULT 15,
    "primaryCalendarId" TEXT,
    "syncExternalCalendars" BOOLEAN NOT NULL DEFAULT false,
    "defaultTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "appointment_settings_tenantId_key" ON "appointment_settings"("tenantId");

ALTER TABLE "appointment_settings"
    ADD CONSTRAINT "appointment_settings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointment_settings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointment_settings_tenant_isolation" ON "appointment_settings"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));
