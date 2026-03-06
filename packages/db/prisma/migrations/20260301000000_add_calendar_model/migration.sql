-- CreateTable
CREATE TABLE "calendars" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "calendars_pkey" PRIMARY KEY ("id")
);

-- AddColumn: calendarId on tasks
ALTER TABLE "tasks" ADD COLUMN "calendarId" TEXT;

-- AddColumn: calendarId on appointments
ALTER TABLE "appointments" ADD COLUMN "calendarId" TEXT;

-- CreateIndex
CREATE INDEX "calendars_tenantId_idx" ON "calendars"("tenantId");
CREATE INDEX "calendars_ownerId_idx" ON "calendars"("ownerId");
CREATE INDEX "tasks_calendarId_idx" ON "tasks"("calendarId");
CREATE INDEX "appointments_calendarId_idx" ON "appointments"("calendarId");

-- AddForeignKey
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "calendars"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "calendars"("id") ON DELETE SET NULL ON UPDATE CASCADE;
