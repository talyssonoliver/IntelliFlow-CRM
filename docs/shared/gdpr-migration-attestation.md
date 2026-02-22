# GDPR Migration Attestation — IFC-070

**Document ID:** IFC-070-GDPR-ATT
**Version:** 1.0
**Date:** 2026-02-19
**Classification:** CONFIDENTIAL
**Status:** Active

---

## 1. Lawful Basis for Data Transfer

This migration operates under **Legitimate Interest** (GDPR Article 6(1)(f)) for the purpose of:

- **Business continuity**: Transitioning from legacy CRM to IntelliFlow CRM to maintain uninterrupted customer relationship management operations
- **Data quality improvement**: Standardizing data formats, enforcing referential integrity, and applying governance classifications
- **Security enhancement**: Moving data to a platform with improved encryption, audit logging, and access controls

A **Legitimate Interest Assessment (LIA)** has been completed and documented. The processing is necessary for the legitimate interests pursued by the data controller and does not override the fundamental rights and freedoms of data subjects.

---

## 2. Data Minimization

Only required fields are migrated as defined in the transformation rules (`scripts/migration/delta-sync.ts`):

| Entity | Fields Migrated | Excluded Fields |
|--------|-----------------|-----------------|
| User | id, email, role, tenantId, timestamps | Legacy UI preferences, session tokens |
| Lead | id, firstName, lastName, email, source, status, score, tenantId | Legacy tracking cookies, deprecated fields |
| Contact | id, firstName, lastName, email, phone, accountId | Legacy notes (migrated separately under consent) |
| Account | id, name, website, industry, tenantId | Legacy billing data (retained in legacy system) |
| Opportunity | id, name, stage, probability, amount, contactId | Legacy forecast models |

All enum values are mapped from legacy integer representations to standardized string enums to ensure data portability.

---

## 3. Purpose Limitation

Migrated data is used exclusively for:

- CRM operations (customer management, lead tracking, opportunity pipeline)
- AI-powered scoring and recommendations (within IntelliFlow platform)
- Regulatory compliance and audit trail maintenance

Data will NOT be used for:
- Third-party marketing without separate consent
- Automated decision-making with legal effects (GDPR Article 22 safeguards in place)
- Cross-border transfers outside the designated data residency region

---

## 4. Retention Alignment (ADR-007)

Retention periods are configured per-entity in the governance layer:

| Entity | Classification | Retention Period | Basis |
|--------|---------------|-----------------|-------|
| User | CONFIDENTIAL | 7 years | Employment records regulation |
| Lead | INTERNAL | 3 years | Sales pipeline lifecycle |
| Contact | CONFIDENTIAL | 7 years | Customer relationship records |
| Account | INTERNAL | 7 years | Business entity records |
| Opportunity | INTERNAL | 5 years | Financial records requirement |

These are enforced programmatically via `addGovernanceColumns()` in `delta-sync.ts`, which attaches `dataClassification`, `retentionYears`, and `legalHold` to every migrated record.

---

## 5. Subject Access Rights

The migration preserves and enhances subject access capabilities:

- **Right of Access (Article 15)**: Full audit trail in `migration-log.txt` enables tracing of any individual record through the ETL pipeline
- **Right to Rectification (Article 16)**: ID mapping (`idMap`) maintains a deterministic legacy-to-new-ID mapping, enabling corrections to be applied in the target system and traced back to source
- **Right to Erasure (Article 17)**: The `legalHold` flag prevents accidental deletion of records under legal obligation; records not under hold follow standard retention policies
- **Right to Portability (Article 20)**: Data is stored in standardized formats with documented schemas, enabling export

---

## 6. DPO Acknowledgment

The Data Protection Officer has reviewed the following aspects of this migration:

- [ ] Lawful basis documentation (Section 1)
- [ ] Data minimization measures (Section 2)
- [ ] Purpose limitation safeguards (Section 3)
- [ ] Retention policy alignment (Section 4)
- [ ] Subject access procedures (Section 5)
- [ ] Audit trail continuity (Section 7)

**DPO Sign-off:** _Pending review_
**Date:** _TBD_

---

## 7. Audit Trail Continuity During Cutover

During the migration cutover window, audit continuity is maintained through:

1. **Pre-migration snapshot**: `reconciliation.ts` captures entity counts and validation state before migration begins
2. **Migration log**: `migration-log.txt` provides continuous timestamp chain for every record transformation, with PII fields redacted via `sanitizeForLog()`
3. **Post-migration validation**: `validate-target.ts` runs 6 categories of checks (PRIMARY_KEY, FOREIGN_KEY, NOT_NULL, DATA_FORMAT, INDEX, PERFORMANCE)
4. **Reconciliation report**: `data-validation-report.csv` with SHA256 content hash ensures report integrity
5. **Circuit breaker protection**: Automatic pause on consecutive failures prevents data corruption during transient outages

The audit gap between legacy system shutdown and target system activation is bridged by the migration log's continuous timestamp sequence, which the DPO can reference for any DSAR received during the cutover period.

---

## 8. Technical Safeguards

| Safeguard | Implementation |
|-----------|---------------|
| Encryption in transit | TLS 1.3 for all database connections |
| Encryption at rest | AES-256 via Supabase storage encryption |
| Access control | Database credentials via environment secrets, not committed to source |
| PII protection | `sanitizeForLog()` strips email, phone, firstName, lastName from all log output |
| Integrity verification | SHA256 hashes on all generated reports and migration summaries |
| Failure recovery | Checkpoint/resume mechanism prevents re-processing of successfully migrated records |
| Schema validation | `validateSchemaVersion()` pre-flight check prevents migration against incompatible source schemas |

---

## 9. References

- ADR-007: Data Governance Classification
- IFC-070 Specification: Data Migration from Legacy
- `scripts/migration/delta-sync.ts`: ETL transformation engine
- `scripts/migration/reconciliation.ts`: Post-migration validation
- `scripts/migration/validate-target.ts`: Constraint verification
- `docs/shared/rollback-procedure.md`: Rollback procedures
