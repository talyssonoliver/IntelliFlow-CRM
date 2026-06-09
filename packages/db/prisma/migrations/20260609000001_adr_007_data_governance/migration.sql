-- ADR-007 Data Governance & Classification.
-- Implements the Accepted governance schema (IFC-135/IFC-140/GOV-001) that the
-- Migration ETL "governance columns" check enforces: a dataClassification tier on
-- the core PII-bearing entities, plus the policy / legal-hold / DSAR tables.
-- All additive; the dataClassification columns are NOT NULL with a DEFAULT so
-- adding them to populated tables is a metadata-only change (no rewrite). The
-- "DataClassification" enum type already exists (created with AuditLogEntry).

-- 1. Classification tier on the four core entities.
ALTER TABLE "leads" ADD COLUMN "dataClassification" "DataClassification" NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "contacts" ADD COLUMN "dataClassification" "DataClassification" NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "accounts" ADD COLUMN "dataClassification" "DataClassification" NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "opportunities" ADD COLUMN "dataClassification" "DataClassification" NOT NULL DEFAULT 'INTERNAL';

-- 2. Retention policy per (tenant, entity type).
CREATE TABLE "data_governance_policies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "classification" "DataClassification" NOT NULL,
    "retentionPeriodDays" INTEGER NOT NULL,
    "autoDeleteEnabled" BOOLEAN NOT NULL DEFAULT true,
    "legalHoldOverride" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_governance_policies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "data_governance_policies_tenantId_idx" ON "data_governance_policies"("tenantId");
CREATE INDEX "data_governance_policies_entityType_idx" ON "data_governance_policies"("entityType");

ALTER TABLE "data_governance_policies" ADD CONSTRAINT "data_governance_policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Legal hold — litigation hold overriding retention/deletion.
CREATE TABLE "legal_holds" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "placedBy" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "releasedBy" TEXT,

    CONSTRAINT "legal_holds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "legal_holds_tenantId_idx" ON "legal_holds"("tenantId");
CREATE INDEX "legal_holds_entityType_entityId_idx" ON "legal_holds"("entityType", "entityId");

ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. DSAR — data-subject access request (GDPR Art. 15-22), 30-day SLA.
CREATE TABLE "dsar_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectEmail" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "results" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dsar_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dsar_requests_tenantId_idx" ON "dsar_requests"("tenantId");
CREATE INDEX "dsar_requests_subjectEmail_idx" ON "dsar_requests"("subjectEmail");
CREATE INDEX "dsar_requests_status_idx" ON "dsar_requests"("status");

ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. RLS on the new tenant-scoped governance tables (ADR-007 / repo convention).
ALTER TABLE "data_governance_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_holds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dsar_requests" ENABLE ROW LEVEL SECURITY;
