-- CreateTable
CREATE TABLE "activity_reactions" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "activitySource" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_reactions_activityId_activitySource_idx" ON "activity_reactions"("activityId", "activitySource");

-- CreateIndex
CREATE INDEX "activity_reactions_tenantId_idx" ON "activity_reactions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_reactions_activityId_activitySource_userId_emoji_key" ON "activity_reactions"("activityId", "activitySource", "userId", "emoji");

-- AddForeignKey
ALTER TABLE "activity_reactions" ADD CONSTRAINT "activity_reactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
