-- IFC-304 PR A: Help Article analytics foundation
-- Additive only: three new tables, no changes to existing tables, no data rewrite.
-- Privacy-preserving daily aggregates + short-lived idempotency guard.

-- CreateTable
CREATE TABLE "help_article_view_daily" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_article_view_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_article_search_noresult_daily" (
    "id" TEXT NOT NULL,
    "normalizedTerm" VARCHAR(120) NOT NULL,
    "day" DATE NOT NULL,
    "searchCount" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_article_search_noresult_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_article_analytics_dedup" (
    "id" TEXT NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_article_analytics_dedup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "help_article_view_daily_tenantId_articleId_day_key" ON "help_article_view_daily"("tenantId", "articleId", "day");

-- CreateIndex
CREATE INDEX "help_article_view_daily_tenantId_idx" ON "help_article_view_daily"("tenantId");

-- CreateIndex
CREATE INDEX "help_article_view_daily_tenantId_day_idx" ON "help_article_view_daily"("tenantId", "day");

-- CreateIndex
CREATE INDEX "help_article_view_daily_articleId_idx" ON "help_article_view_daily"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "help_article_search_noresult_daily_term_day_key" ON "help_article_search_noresult_daily"("tenantId", "normalizedTerm", "day");

-- CreateIndex
CREATE INDEX "help_article_search_noresult_daily_tenantId_idx" ON "help_article_search_noresult_daily"("tenantId");

-- CreateIndex
CREATE INDEX "help_article_search_noresult_daily_tenantId_day_idx" ON "help_article_search_noresult_daily"("tenantId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "help_article_analytics_dedup_tenantId_idempotencyKey_key" ON "help_article_analytics_dedup"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "help_article_analytics_dedup_tenantId_idx" ON "help_article_analytics_dedup"("tenantId");

-- CreateIndex
CREATE INDEX "help_article_analytics_dedup_expiresAt_idx" ON "help_article_analytics_dedup"("expiresAt");

-- AddForeignKey
ALTER TABLE "help_article_view_daily" ADD CONSTRAINT "help_article_view_daily_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "help_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_article_view_daily" ADD CONSTRAINT "help_article_view_daily_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_article_search_noresult_daily" ADD CONSTRAINT "help_article_search_noresult_daily_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_article_analytics_dedup" ADD CONSTRAINT "help_article_analytics_dedup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security (defense-in-depth; app layer also filters by tenantId)
ALTER TABLE "help_article_view_daily" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "help_article_view_daily_tenant_isolation" ON "help_article_view_daily"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "help_article_search_noresult_daily" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "help_article_search_noresult_daily_tenant_isolation" ON "help_article_search_noresult_daily"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "help_article_analytics_dedup" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "help_article_analytics_dedup_tenant_isolation" ON "help_article_analytics_dedup"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));
