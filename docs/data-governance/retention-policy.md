# Data Retention Policy - IFC-140

**Version**: 1.0
**Effective Date**: 2025-12-30
**Last Reviewed**: 2025-12-29
**Owner**: Data Protection Officer + Legal Team
**Next Review**: 2026-12-29

---

## Policy Statement

IntelliFlow CRM retains personal data only for as long as necessary to fulfill the purposes for which it was collected, in compliance with GDPR, UK GDPR, and applicable data protection laws.

## Retention Schedules by Data Classification

### PUBLIC Data (7 Years Retention)

**Examples**: Marketing materials, published content, public contact information

**Retention Period**: 7 years from creation date

**Disposal Method**: Automated anonymization via `anonymize_record()` function

**Legal Basis**: UK tax and accounting requirements (6 years + 1 year buffer)

**Automation**: Executed daily via `schedule_deletion_by_retention()` scheduled job

### INTERNAL Data (3 Years Retention)

**Examples**: Internal communications, draft documents, meeting notes

**Retention Period**: 3 years from creation date

**Disposal Method**: Automated anonymization

**Legal Basis**: Business operational needs

**Automation**: Executed daily via scheduled job

### CONFIDENTIAL Data (10 Years Retention)

**Examples**: Contracts, legal agreements, financial records

**Retention Period**: 10 years from creation date

**Disposal Method**: Automated anonymization with manual review flag

**Legal Basis**: UK Limitation Act 1980 (6 years for contracts, 12 years for deeds, using 10 years as standard)

**Automation**: Flagged for manual review before anonymization

### PRIVILEGED Data (Permanent Retention)

**Examples**: Legal holds, regulatory filings, dispute records

**Retention Period**: Permanent (no automatic deletion)

**Disposal Method**: Manual deletion only, requires DPO approval

**Legal Basis**: Ongoing legal obligations, regulatory compliance

**Automation**: Excluded from automated deletion

---

## Entity-Specific Retention Rules

### Leads

| Field Group | Classification | Retention | Rationale |
|-------------|---------------|-----------|-----------|
| Contact info (email, phone) | INTERNAL | 3 years | Marketing consent duration |
| Lead score history | INTERNAL | 3 years | AI model training/audit |
| Conversion data | CONFIDENTIAL | 10 years | Business analytics |

**Post-Conversion**: Lead data transferred to Contact record, original lead anonymized after 3 years.

### Contacts

| Field Group | Classification | Retention | Rationale |
|-------------|---------------|-----------|-----------|
| Personal details | CONFIDENTIAL | 10 years | Business relationship |
| Communication history | CONFIDENTIAL | 10 years | Contractual evidence |
| Preferences | INTERNAL | 3 years | Active relationship duration |

**Post-Relationship**: After account closure, contact data downgraded to INTERNAL (3 year retention).

### Accounts

| Field Group | Classification | Retention | Rationale |
|-------------|---------------|-----------|-----------|
| Company info | PUBLIC | 7 years | Public record |
| Financial data | CONFIDENTIAL | 10 years | UK tax requirements |
| Contract history | CONFIDENTIAL | 10 years | Limitation Act compliance |

**Account Closure**: Retention clock starts from final invoice date.

### Opportunities

| Field Group | Classification | Retention | Rationale |
|-------------|---------------|-----------|-----------|
| Deal details | CONFIDENTIAL | 10 years | Revenue recognition audit |
| Forecast data | INTERNAL | 3 years | Business planning |
| Pipeline history | INTERNAL | 3 years | Sales analytics |

**Closed Deals**: Won deals retained for 10 years, lost deals for 3 years.

### Tasks & Activities

| Field Group | Classification | Retention | Rationale |
|-------------|---------------|-----------|-----------|
| Task records | INTERNAL | 3 years | Operational history |
| Meeting notes | INTERNAL | 3 years | Business context |
| Follow-up actions | INTERNAL | 3 years | CRM operation |

**Linked to Opportunities**: If task linked to won opportunity, inherit CONFIDENTIAL (10 year) retention.

### Audit Logs

| Field Group | Classification | Retention | Rationale |
|-------------|---------------|-----------|-----------|
| Access logs | PRIVILEGED | 7 years | GDPR accountability |
| Change logs | PRIVILEGED | 7 years | Regulatory audit |
| Security events | PRIVILEGED | 7 years | Incident investigation |

**Immutability**: Audit logs are immutable and excluded from anonymization.

### Consents

| Field Group | Classification | Retention | Rationale |
|-------------|---------------|-----------|-----------|
| Marketing consent | PRIVILEGED | 7 years post-withdrawal | GDPR proof of consent |
| Processing consent | PRIVILEGED | 7 years post-termination | Legal defense |

**Rationale**: Proof of lawful processing must be retained even after data deletion.

---

## Automated Retention Enforcement

### Daily Scheduled Job

```sql
-- Runs at 2:00 AM UTC daily
SELECT schedule_deletion_by_retention();
```

**Process**:
1. Identify records past retention period
2. Check for legal holds (skip if hold active)
3. Execute `anonymize_record()` function
4. Log anonymization in audit trail
5. Update GDPR metadata with `anonymized_at` timestamp

### Anonymization Method

**Not Deletion**: We anonymize rather than hard delete to preserve referential integrity and audit trails.

**Technique**: Personal Identifiable Information (PII) replaced with:
- Emails: `anonymized-{uuid}@deleted.local`
- Names: `Anonymized User`
- Phone numbers: `NULL`
- Addresses: `NULL`
- Free text fields: `NULL`

**Preserved**: Record ID, timestamps, aggregate metrics (non-personal)

---

## Legal Hold Exception Process

### Placing a Legal Hold

**Authority**: Legal team, DPO, or authorized manager

**Process**:
1. Create entry in `legal_holds` table
2. Specify case reference, hold reason, affected records
3. Automated retention blocked for held records
4. Notification sent to DPO

**SQL Example**:
```sql
INSERT INTO legal_holds (table_name, record_id, case_reference, hold_reason, placed_by)
VALUES ('contacts', 'uuid-here', 'CASE-2025-001', 'Litigation discovery', 'legal-user-id');
```

### Releasing a Legal Hold

**Authority**: Legal team or DPO only

**Process**:
1. Update `legal_holds` with `released_at` timestamp
2. Record becomes eligible for retention enforcement
3. Normal retention schedule resumes

**Review**: Legal holds reviewed quarterly to prevent indefinite holds.

---

## Data Subject Access Requests (DSAR) Impact

### Right to Erasure (GDPR Article 17)

**Override**: DSAR erasure requests take precedence over retention schedules.

**Exception**: Cannot erase data under legal hold or required by law.

**Process**: Immediate anonymization upon verified DSAR (see `apps/api/src/workflow/dsar-workflow.ts`).

### Right to Restriction (GDPR Article 18)

**Mechanism**: Places legal hold on subject's data, preventing deletion.

**Duration**: Until data subject lifts restriction or dispute resolved.

---

## Compliance Monitoring

### Daily Metrics

```sql
SELECT * FROM gdpr_compliance_report();
```

**Tracked Metrics**:
- Total records under management
- Records anonymized (cumulative)
- Overdue deletions (should be 0)
- Active legal holds
- Pending DSAR requests
- Overdue DSAR requests (breach if > 0)

### Quarterly Review

**DPO Actions**:
1. Review retention schedules for appropriateness
2. Audit anonymization process effectiveness
3. Check legal holds for ongoing necessity
4. Validate compliance with regulatory changes
5. Update policy if needed

**Report**: Generated in `artifacts/reports/retention-review-YYYY-QN.pdf`

---

## Data Residency & Retention

### UK/EU Data

**Storage**: EU-West (Ireland) or UK-South (London) regions only

**Retention**: Follows UK GDPR and EU GDPR requirements

**Transfers**: No transfers outside UK/EU without Standard Contractual Clauses

### Data Residency Metadata

Tracked in `gdpr_metadata.data_residency` field:
- `EU`: Data must remain in EU
- `UK`: Data must remain in UK
- `UK_EU`: Data can move within UK/EU
- `GLOBAL`: No residency restriction (public data only)

**Enforcement**: Application-level checks prevent cross-border transfers.

---

## Exceptions & Special Cases

### Regulatory Investigations

**Override**: Data retention may be extended during ongoing investigations.

**Authority**: DPO with legal team approval.

**Documentation**: Case reference and expected completion date required.

### Dispute Resolution

**Override**: Contract-related data retained until statute of limitations expires.

**Duration**: UK Limitation Act: 6 years for contracts, 12 years for deeds.

**Automatic**: Legal hold placed automatically when dispute flagged.

### Insurance Claims

**Override**: Data related to insurance claims retained for claim period + 6 years.

**Trigger**: Claim flag in CRM system.

---

## Data Minimization Principles

### Collection

**Rule**: Only collect data necessary for stated purpose.

**Validation**: Data classification set at collection time.

**Review**: Annual review of data collection forms/fields.

### Processing

**Rule**: Process only data required for current operation.

**Implementation**: RLS policies restrict access to authorized users only.

### Storage

**Rule**: Delete or anonymize data when purpose fulfilled.

**Enforcement**: Automated retention schedules.

---

## Roles & Responsibilities

### Data Protection Officer (DPO)

- Owns and maintains retention policy
- Approves exceptions and legal holds
- Monitors compliance metrics
- Conducts quarterly reviews
- Authority to override retention (with justification)

### Legal Team

- Places/releases legal holds
- Advises on retention periods for contracts
- Handles DSAR requests with DPO
- Ensures regulatory compliance

### Engineering Team

- Implements automated retention enforcement
- Maintains anonymization functions
- Monitors scheduled job execution
- Escalates failures to DPO

### Business Users

- Set appropriate data classification on records
- Flag records requiring legal hold
- Request retention extensions (via DPO)

---

## Policy Updates & Version Control

**Review Frequency**: Annually, or when:
- Regulatory changes occur
- Business model changes
- New data types introduced
- Compliance audit findings

**Approval**: DPO + Legal team + Executive sponsor

**Communication**: All staff notified of policy changes via email + training.

**Version History**: Maintained in git repository with change log.

---

## Related Documentation

- [GDPR RLS Policies](../../infra/supabase/rls-policies-gdpr.sql)
- [DSAR Workflow](../api/src/workflow/dsar-workflow.ts)
- [Data Classification Guidelines](./data-classification.md)
- [Legal Hold Procedure](./legal-hold-procedure.md)
- [Privacy Policy](../legal/privacy-policy.md)

---

## Attestation

**Reviewed and Approved**:

- Data Protection Officer: _________________ Date: _________
- Legal Counsel: _________________ Date: _________
- Chief Technology Officer: _________________ Date: _________

**Next Scheduled Review**: 2026-12-29
