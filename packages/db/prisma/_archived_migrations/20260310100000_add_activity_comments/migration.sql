-- CreateTable
CREATE TABLE "activity_comments" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "activitySource" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_comments_activityId_activitySource_idx" ON "activity_comments"("activityId", "activitySource");

-- CreateIndex
CREATE INDEX "activity_comments_tenantId_idx" ON "activity_comments"("tenantId");

-- AddForeignKey
ALTER TABLE "activity_comments" ADD CONSTRAINT "activity_comments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
