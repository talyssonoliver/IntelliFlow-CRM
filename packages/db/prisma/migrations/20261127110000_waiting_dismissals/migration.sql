-- MVP-012: "handled without a reply" for the dashboard's Waiting-for-reply rows.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only. One NEW table; no
-- existing table, column, row, index or constraint is touched, and nothing reads it until the
-- application code that ships with it runs.
--
-- Why: the dashboard's to-do rows (tasks, follow-ups, replies) now share one "done" checkbox. A
-- reply that was handled outside the CRM (a call, a chat) has no outbound email to clear the wait,
-- so the checkbox stores a dismissal. "personKey" is `lead:<id>` or `contact:<id>`; "since" and
-- "latestAt" are the wait that was dismissed (its first and newest unanswered inbound mail), so a
-- newer inbound email (a later "latestAt", or a later "since") brings the person back;
-- "unanswered" records how many mails were waiting then.
--
-- Recovery plan: drop table "waiting_dismissals" (nothing else depends on it). Production applies
-- only through the gated `prisma migrate deploy` workflow.

-- CreateTable
CREATE TABLE "waiting_dismissals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personKey" TEXT NOT NULL,
    "since" TIMESTAMP(3) NOT NULL,
    "unanswered" INTEGER NOT NULL,
    "latestAt" TIMESTAMP(3) NOT NULL,
    "dismissedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waiting_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waiting_dismissals_tenantId_idx" ON "waiting_dismissals"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "waiting_dismissals_tenantId_personKey_key" ON "waiting_dismissals"("tenantId", "personKey");

-- AddForeignKey
ALTER TABLE "waiting_dismissals" ADD CONSTRAINT "waiting_dismissals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security (defence in depth; shape of 20261123100000_tenant_ai_provider_keys). ENABLE
-- only, never FORCE: the explicit tenantId in every query remains the application-level boundary.
ALTER TABLE "waiting_dismissals" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "waiting_dismissals_tenant_isolation" ON "waiting_dismissals"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
