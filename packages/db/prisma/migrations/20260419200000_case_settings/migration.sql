-- PG-190 Case Settings — per-tenant case prefix, default priority, auto-assign policy.

CREATE TABLE "case_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "casePrefix" TEXT NOT NULL DEFAULT 'CASE-',
    "defaultPriority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "autoAssignEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoAssignUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique + FK index)
CREATE UNIQUE INDEX "case_settings_tenantId_key" ON "case_settings"("tenantId");
CREATE INDEX "case_settings_autoAssignUserId_idx" ON "case_settings"("autoAssignUserId");

-- AddForeignKey (tenant cascade)
ALTER TABLE "case_settings"
    ADD CONSTRAINT "case_settings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (user set-null: auto-assigned owner)
ALTER TABLE "case_settings"
    ADD CONSTRAINT "case_settings_autoAssignUserId_fkey"
    FOREIGN KEY ("autoAssignUserId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable Row Level Security on case_settings
ALTER TABLE "case_settings" ENABLE ROW LEVEL SECURITY;

-- Per-tenant RLS policy — restrict rows to the connection's app.current_tenant_id GUC.
CREATE POLICY "case_settings_tenant_isolation" ON "case_settings"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));
