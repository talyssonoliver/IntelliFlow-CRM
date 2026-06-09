-- ADR-007 Data Governance & Classification — per-model classification.
-- Adds the `dataClassification` tier to the four core PII-bearing entities,
-- extending the existing taxonomy (the "DataClassification" enum already exists,
-- created with AuditLogEntry, and is already applied on AuditLogEntry).
--
-- All additive: the columns are NOT NULL with a DEFAULT, so adding them to
-- populated tables is a metadata-only change (no table rewrite).
--
-- NOTE: retention-policy / legal-hold / DSAR storage is deliberately NOT created
-- here. Those are enforced via raw-SQL tables + the DSAR workflow (#355), not
-- Prisma models; creating `legal_holds` / `dsar_requests` from this migration
-- would collide with the existing relations and split the source of truth.

ALTER TABLE "leads" ADD COLUMN "dataClassification" "DataClassification" NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "contacts" ADD COLUMN "dataClassification" "DataClassification" NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "accounts" ADD COLUMN "dataClassification" "DataClassification" NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "opportunities" ADD COLUMN "dataClassification" "DataClassification" NOT NULL DEFAULT 'INTERNAL';
