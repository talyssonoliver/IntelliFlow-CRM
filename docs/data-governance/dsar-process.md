# Data Subject Access Request (DSAR) Process - IFC-140

**Version**: 1.0
**Effective Date**: 2025-12-30
**SLA**: 30 days from verified request
**Owner**: DPO + Legal Team

---

## Overview

This document outlines the process for handling Data Subject Access Requests (DSAR) under GDPR Articles 15-22.

## Supported Request Types

| Request Type | GDPR Article | Description | Processing Time |
|--------------|--------------|-------------|-----------------|
| **Access** | Article 15 | Provide copy of all personal data | 30 days |
| **Erasure** | Article 17 | Delete/anonymize personal data | 30 days |
| **Rectification** | Article 16 | Correct inaccurate data | 30 days |
| **Portability** | Article 20 | Export data in machine-readable format | 30 days |
| **Restriction** | Article 18 | Temporarily halt processing | Immediate |
| **Objection** | Article 21 | Stop processing for specific purposes | Immediate |

---

## DSAR Workflow Steps

### Step 1: Request Initiation

**Trigger**: Data subject submits request via:
- Web form: `/dsar/request`
- Email: dpo@intelliflow-crm.com
- Written letter to registered office

**Validation**:
- Request type identified
- Data subject identity captured (email required)
- Request details documented

**System Action**:
```typescript
const workflow = createDSARWorkflow(db, emailService, storageService);
const state = await workflow.initiateDSAR({
  requestType: 'access',
  subjectId: 'user-uuid',
  subjectEmail: 'user@example.com',
  preferredFormat: 'json',
});
```

**Output**:
- DSAR request created with unique ID
- SLA deadline calculated (30 days from now)
- Verification email sent to data subject
- Status: `PENDING`

---

### Step 2: Identity Verification

**Security Requirement**: Verify requestor is the data subject or authorized representative.

**Method**: Email verification link with cryptographic token.

**Verification Email Contains**:
- Unique verification URL
- Request ID
- Request type
- Expiry notice (48 hours)

**User Action**: Click verification link.

**System Action**:
```typescript
const verified = await workflow.verifyIdentity(requestId, token);
```

**Checks**:
- Token matches database record
- Token not expired (< 48 hours old)
- Request still in `PENDING` status

**Success**:
- Status updated to `VERIFIED`
- `verified_at` timestamp recorded
- Automatic progression to Step 3

**Failure**:
- Error message returned
- Audit log entry created
- User can request new verification email

---

### Step 3: Automated Processing

**Trigger**: Successful identity verification.

**System Action**:
- Status updated to `PROCESSING`
- Request routed to appropriate handler based on type
- Audit trail logged

**Processing by Type**:

#### Access Request (Article 15)

**Data Gathered**:
- All leads owned by subject
- All contacts owned by subject
- All accounts owned by subject
- All opportunities owned by subject
- All tasks owned by subject
- All audit logs for subject
- All consent records for subject

**Export Format**: JSON (default) or CSV

**Export Structure**:
```json
{
  "format": "json",
  "data": {
    "leads": [...],
    "contacts": [...],
    "accounts": [...],
    "opportunities": [...],
    "tasks": [...],
    "audit_logs": [...],
    "consents": [...]
  },
  "metadata": {
    "exportedAt": "2025-12-30T00:00:00Z",
    "recordCount": 156,
    "tables": ["leads", "contacts", "accounts", ...],
    "dataSubjectId": "uuid"
  }
}
```

**Storage**: Uploaded to secure S3 bucket with expiring pre-signed URL (valid for 7 days).

**Delivery**: Email sent to data subject with download link.

#### Erasure Request (Article 17)

**Pre-Check**: Verify no legal holds exist.

**SQL Execution**:
```sql
-- Check legal holds
SELECT * FROM legal_holds
WHERE record_id = :subject_id
  AND released_at IS NULL;

-- If no holds, anonymize
SELECT anonymize_record('leads', :subject_id);
SELECT anonymize_record('contacts', :subject_id);
SELECT anonymize_record('accounts', :subject_id);
```

**Anonymization**:
- Email → `anonymized-{uuid}@deleted.local`
- Name → `Anonymized User`
- Phone → `NULL`
- PII fields → `NULL`
- `data_minimized` flag → `TRUE`
- `anonymized_at` timestamp set

**Exceptions**:
- Audit logs NOT anonymized (regulatory requirement)
- Consents NOT anonymized (proof of lawful processing)
- Data under legal hold NOT anonymized

**Notification**: Confirmation email sent.

#### Rectification Request (Article 16)

**Process**:
- Email sent with link to profile update page
- Data subject updates information directly
- Changes logged in audit trail

**Alternative**: Manual update by DPO if subject cannot access system.

#### Portability Request (Article 20)

**Same as Access Request** but ensures machine-readable format (JSON/CSV).

**Additional**: Includes metadata for easy import to other systems.

#### Restriction Request (Article 18)

**Process**:
- Legal hold placed on subject's data
- Processing (including deletion) halted
- Subject can still access data
- Restriction lifted only by subject or DPO

**SQL**:
```sql
INSERT INTO legal_holds (
  case_reference, table_name, record_id, hold_reason, placed_by
) VALUES (
  'DSAR-RESTRICTION-{request_id}',
  'users',
  :subject_id,
  'Data subject requested processing restriction (GDPR Article 18)',
  :subject_id
);
```

#### Objection Request (Article 21)

**Process**:
- Withdraw consent for objected purposes
- Stop processing for those purposes
- Data retained but not used

**Common Objections**:
- Marketing communications
- Profiling/analytics
- Third-party sharing

**SQL**:
```sql
UPDATE consents
SET given = FALSE, withdrawn_at = NOW()
WHERE subject_id = :subject_id
  AND purpose IN ('marketing', 'analytics', 'profiling');
```

---

### Step 4: Completion & Notification

**Final Actions**:
- Status updated to `COMPLETED`
- `completed_at` timestamp recorded
- Completion email sent to data subject
- Final audit log entry created

**Completion Email**:
- Confirms request processed
- Provides next steps (if any)
- Includes DPO contact for questions

**SLA Tracking**: Request completed within 30-day deadline.

---

## SLA Management

### 30-Day Deadline

**Calculation**: From date of **verified** request (not initial submission).

**Tracking**:
```sql
SELECT id, subject_email, request_type,
       sla_deadline,
       sla_deadline - NOW() AS days_remaining
FROM data_subject_requests
WHERE status NOT IN ('completed', 'rejected')
ORDER BY sla_deadline ASC;
```

### Overdue Requests

**Alert Trigger**: SLA deadline passed without completion.

**Notification**:
- Daily email to DPO with overdue list
- Slack alert to #data-protection channel
- Dashboard widget shows overdue count

**Escalation**: If > 5 days overdue, escalate to Legal team.

### Extensions

**GDPR Allows**: 2-month extension if request complex or numerous requests from same subject.

**Requirement**: Inform data subject within 30 days with reason for extension.

**Approval**: DPO only.

---

## Identity Verification Alternatives

### Email Verification (Default)

**Method**: Cryptographic token sent to registered email.

**Security**: Token valid for 48 hours, single-use.

### Enhanced Verification (High-Value Data)

**When**: Requested for particularly sensitive data or large erasure requests.

**Methods**:
- Video call with ID verification
- Notarized authorization letter
- In-person verification at registered office

**Approval**: DPO decision.

---

## Exceptions & Rejections

### Request Rejected If:

1. **Unable to Verify Identity**: After 3 failed verification attempts.
2. **Manifestly Unfounded**: Clearly frivolous or excessive.
3. **Excessive**: Repeated identical requests within 12 months.
4. **Legal Obligation**: Data required by law to retain (inform subject of basis).

**Process**:
- Status set to `REJECTED`
- Rejection reason documented
- Subject notified with explanation and appeal rights

### Partial Fulfillment

**Scenario**: Some data cannot be deleted due to legal hold.

**Process**:
- Fulfill what is possible
- Inform subject of:
  - What was processed
  - What was not processed
  - Reason for partial fulfillment
  - When remaining data will be processed

---

## Audit Trail

**Every Step Logged**:
```json
{
  "entity_type": "data_subject_request",
  "entity_id": "request-uuid",
  "action": "VERIFIED",
  "timestamp": "2025-12-30T00:15:00Z",
  "metadata": {
    "verifiedAt": "2025-12-30T00:15:00Z",
    "verificationMethod": "email_token"
  }
}
```

**Events Logged**:
- Request initiated
- Verification attempted (success/failure)
- Processing started
- Data exported (record count)
- Data erased (tables affected)
- Request completed
- Any errors or exceptions

---

## Reporting & Metrics

### Monthly DSAR Report

**Contents**:
- Total requests received
- Requests by type
- Average processing time
- SLA compliance rate
- Overdue requests
- Rejected requests (with reasons)

**Recipients**: DPO, Legal team, Executive leadership.

### Dashboard Metrics

**Real-Time**:
- Pending requests (awaiting verification)
- In-progress requests
- Overdue requests (SLA breach)
- Requests completed this month

**Location**: `/admin/compliance/dsar-dashboard`

---

## Training & Awareness

**All Staff**: Annual GDPR awareness training includes DSAR basics.

**DPO Team**: Quarterly deep-dive on DSAR procedures.

**Customer Service**: Monthly reminder of how to escalate DSAR requests.

---

## Related Documentation

- [DSAR Workflow Implementation](../../apps/api/src/workflow/dsar-workflow.ts)
- [Retention Policy](./retention-policy.md)
- [Legal Hold Procedure](./legal-hold-procedure.md)
- [Privacy Policy](../legal/privacy-policy.md)

---

## Contact

**Data Protection Officer**:
Email: dpo@intelliflow-crm.com
Address: [Company Registered Office]

**DSAR Portal**: https://intelliflow-crm.com/dsar
