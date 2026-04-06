-- CreateIndex
CREATE INDEX "notifications_dedup_idx" ON "notifications"("tenantId", "recipientId", "sourceType", "createdAt");
