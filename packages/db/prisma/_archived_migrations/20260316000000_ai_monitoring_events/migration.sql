-- CreateTable
CREATE TABLE "ai_monitoring_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "model" TEXT,
    "metric" TEXT,
    "value" DOUBLE PRECISION,
    "flagged" BOOLEAN,
    "severity" TEXT,
    "payload" JSONB,
    "tenantId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_monitoring_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_monitoring_events_eventType_idx" ON "ai_monitoring_events"("eventType");

-- CreateIndex
CREATE INDEX "ai_monitoring_events_model_idx" ON "ai_monitoring_events"("model");

-- CreateIndex
CREATE INDEX "ai_monitoring_events_recordedAt_idx" ON "ai_monitoring_events"("recordedAt");

-- CreateIndex
CREATE INDEX "ai_monitoring_events_tenantId_idx" ON "ai_monitoring_events"("tenantId");

-- CreateIndex
CREATE INDEX "ai_monitoring_events_tenantId_recordedAt_idx" ON "ai_monitoring_events"("tenantId", "recordedAt");

-- CreateIndex
CREATE INDEX "ai_monitoring_events_eventType_recordedAt_idx" ON "ai_monitoring_events"("eventType", "recordedAt");

-- CreateIndex
CREATE INDEX "ai_monitoring_events_eventType_model_recordedAt_idx" ON "ai_monitoring_events"("eventType", "model", "recordedAt");

-- CreateIndex
CREATE INDEX "ai_monitoring_events_eventType_severity_idx" ON "ai_monitoring_events"("eventType", "severity");

-- AddForeignKey
ALTER TABLE "ai_monitoring_events" ADD CONSTRAINT "ai_monitoring_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
