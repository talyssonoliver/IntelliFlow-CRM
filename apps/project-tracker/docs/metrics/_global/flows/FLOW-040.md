# FLOW-040: DSAR Data Erasure (GDPR Article 17)

## Overview

| Property          | Value                                     |
| ----------------- | ----------------------------------------- |
| **Flow ID**       | FLOW-040                                  |
| **Name**          | DSAR Data Erasure / Right to be Forgotten |
| **Category**      | Seguranca e Compliance                    |
| **Priority**      | Critical                                  |
| **Sprint**        | 11-12                                     |
| **Related Tasks** | IFC-140, IFC-155                          |

## Description

Handles Data Subject Access Requests (DSAR) for erasure under GDPR Article 17
("Right to be Forgotten"). Atomically purges all personal data including search
indexes, embeddings, and content while respecting legal hold constraints.

---

## Actors

- **Data Subject**: Requests erasure of their personal data
- **Privacy Officer**: Reviews and approves erasure requests
- **System**: Executes automated purge workflow
- **Audit Logger**: Records all erasure actions for compliance

---

## Pre-conditions

- Data subject identity verified (email, ID document, or auth)
- No active legal hold on subject's data
- Request received within GDPR response deadline (30 days)
- System has audit logging enabled

---

## User Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DSAR ERASURE FLOW (GDPR Article 17)                     │
└─────────────────────────────────────────────────────────────────────────────┘

[Data Subject] submits erasure request
         │
         ▼
┌─────────────────┐
│  DSAR Form      │ (apps/web/src/app/privacy/dsar/page.tsx) [GAP]
│                 │ - Request type: Erasure
│                 │ - Identity verification
│                 │ - Reason (optional)
└────────┬────────┘
         │
         ▼ tRPC mutation
┌─────────────────┐
│ privacy.router  │ (apps/api/src/modules/privacy/dsar.router.ts) [GAP]
│ - submitRequest │ - Validate identity
│ - verifyRequest │ - Create DSAR record
│ - getStatus     │ - Queue for processing
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Verification   │ - Email confirmation link
│  Step           │ - Identity document check (optional)
│                 │ - 2FA if registered user
└────────┬────────┘
         │
         ▼ Verified
┌─────────────────┐
│ DSARWorkflow    │ (apps/api/src/workflow/dsar-workflow.ts) [EXISTS]
│                 │ - handleErasureRequest()
│                 │ - Check legal holds
│                 │ - Execute purge steps
└────────┬────────┘
         │
         ├──────────────────────────────────┐
         ▼                                  ▼
┌─────────────────┐                ┌─────────────────┐
│ purgeSearchIndexes│              │ anonymizePersonal│
│ (IFC-155)        │              │ Data             │
│ - embeddings     │              │ - leads          │
│ - search_vector  │              │ - contacts       │
│ - extracted_text │              │ - accounts       │
└────────┬─────────┘              └────────┬─────────┘
         │                                  │
         └──────────────┬───────────────────┘
                        ▼
              ┌─────────────────┐
              │  Audit Log      │ - Action: ERASURE
              │                 │ - Subject ID
              │                 │ - Purged fields
              │                 │ - Timestamp
              └────────┬────────┘
                       ▼
              ┌─────────────────┐
              │  Confirmation   │ - Email to data subject
              │                 │ - Certificate of erasure
              │                 │ - Audit reference ID
              └─────────────────┘
```

---

## Flow Steps

### Step 1: Request Submission

**Trigger**: Data subject submits erasure request via form or email

**Input**:

```typescript
interface DSARRequest {
  type:
    | 'ACCESS'
    | 'ERASURE'
    | 'RECTIFICATION'
    | 'PORTABILITY'
    | 'RESTRICTION'
    | 'OBJECTION';
  subjectEmail: string;
  subjectName: string;
  verificationMethod: 'EMAIL' | 'ID_DOCUMENT' | 'AUTH_SESSION';
  reason?: string;
  scopeRestriction?: {
    tenantId?: string;
    dataCategories?: string[];
  };
}
```

**Validation**:

- Email format valid
- Request type supported
- Not duplicate of pending request

---

### Step 2: Identity Verification

**Methods**:

| Method       | Process                                   | Security Level |
| ------------ | ----------------------------------------- | -------------- |
| EMAIL        | Confirmation link with token (24h expiry) | Medium         |
| ID_DOCUMENT  | Upload + manual review by Privacy Officer | High           |
| AUTH_SESSION | User logged in with valid session         | High           |

**Output**: Verified DSAR record with `verifiedAt` timestamp

---

### Step 3: Legal Hold Check

**Location**: `apps/api/src/workflow/dsar-workflow.ts`

```typescript
// Check for legal holds before processing
const legalHolds = await prisma.$queryRaw<LegalHold[]>`
  SELECT id, retention_until FROM legal_holds
  WHERE subject_id = ${subjectId}::text
    AND active = true
  LIMIT 1
`;

if (legalHolds.length > 0) {
  throw new LegalHoldError(
    `Subject under legal hold until ${legalHolds[0].retention_until}`
  );
}
```

**Outcome**:

- **No Hold**: Proceed with erasure
- **Active Hold**: Reject with explanation and retention date

---

### Step 4: Search Index Purge (IFC-155)

**Location**: `apps/ai-worker/src/services/embedding-purge.service.ts`

**Purged Fields**:

| Table            | Fields                                   | Replacement                     |
| ---------------- | ---------------------------------------- | ------------------------------- |
| `case_documents` | embedding, search_vector, extracted_text | NULL, NULL, '[REDACTED - GDPR]' |
| `contact_notes`  | embedding, search_vector, content        | NULL, NULL, '[REDACTED - GDPR]' |

**Atomicity**: All purge operations wrapped in `prisma.$transaction`

```typescript
return await this.prisma.$transaction(async (tx) => {
  const docResult = await tx.$executeRaw`
    UPDATE case_documents
    SET embedding = NULL, search_vector = NULL, extracted_text = '[REDACTED - GDPR]'
    WHERE created_by = ${subjectId}::text AND tenant_id = ${tenantId}::uuid
  `;

  const noteResult = await tx.$executeRaw`
    UPDATE contact_notes
    SET embedding = NULL, search_vector = NULL, content = '[REDACTED - GDPR]'
    WHERE author = ${subjectId}::text AND "tenantId" = ${tenantId}
  `;

  // Create audit log within same transaction
  await tx.auditLogEntry.create({ ... });

  return { documentsPurged: docResult, notesPurged: noteResult };
});
```

---

### Step 5: Personal Data Anonymization

**Location**: `apps/api/src/workflow/dsar-workflow.ts`

**Anonymized Entities**:

| Entity   | Fields                            | Method           |
| -------- | --------------------------------- | ---------------- |
| Lead     | name, email, phone, company       | Hash + timestamp |
| Contact  | firstName, lastName, email, phone | Hash + timestamp |
| Account  | name, billingAddress              | Hash + timestamp |
| Activity | notes (if contains PII)           | '[REDACTED]'     |

---

### Step 6: Audit Logging

**Audit Entry**:

```typescript
interface ErasureAuditEntry {
  eventType: 'GDPR_ERASURE';
  action: 'DELETE';
  subjectId: string;
  requestId: string;
  tenantId: string;
  purgedFields: string[];
  documentsPurged: number;
  notesPurged: number;
  executedAt: Date;
  executedBy: 'SYSTEM' | string; // Privacy Officer ID if manual
  verificationMethod: string;
  certificateId: string;
}
```

---

### Step 7: Confirmation

**Outputs**:

1. **Email to Data Subject**: Confirmation of erasure completion
2. **Erasure Certificate**: PDF with audit reference
3. **Internal Notification**: Privacy Officer notified

---

## Edge Cases

| Scenario                      | Handling                                           |
| ----------------------------- | -------------------------------------------------- |
| Legal hold active             | Reject with retention date; notify Privacy Officer |
| Subject not found             | Return "No data found" (don't confirm existence)   |
| Partial erasure (shared data) | Anonymize subject's portion only                   |
| Request timeout (>30 days)    | Auto-escalate to Privacy Officer                   |
| Duplicate request             | Link to existing request status                    |
| Unverified identity           | Hold for 7 days, then auto-reject                  |

---

## Technical Artifacts

### Backend (IMPLEMENTED)

| Artifact        | Path                                                                    | Status   |
| --------------- | ----------------------------------------------------------------------- | -------- |
| DSAR Workflow   | `apps/api/src/workflow/dsar-workflow.ts`                                | COMPLETE |
| Embedding Purge | `apps/ai-worker/src/services/embedding-purge.service.ts`                | COMPLETE |
| Purge Tests     | `apps/ai-worker/src/services/__tests__/embedding-purge.service.test.ts` | COMPLETE |

### API Layer (GAP)

| Artifact        | Path                                          | Status              |
| --------------- | --------------------------------------------- | ------------------- |
| Privacy Router  | `apps/api/src/modules/privacy/dsar.router.ts` | **NOT IMPLEMENTED** |
| DSAR Validators | `packages/validators/src/dsar.ts`             | **NOT IMPLEMENTED** |

### Frontend (GAP)

| Artifact        | Path                                                 | Status              |
| --------------- | ---------------------------------------------------- | ------------------- |
| DSAR Form       | `apps/web/src/app/privacy/dsar/page.tsx`             | **NOT IMPLEMENTED** |
| Request Status  | `apps/web/src/app/privacy/dsar/[requestId]/page.tsx` | **NOT IMPLEMENTED** |
| Consent Manager | `apps/web/src/components/gdpr/ConsentManager.tsx`    | **NOT IMPLEMENTED** |

---

## Compliance Requirements

| Regulation      | Requirement             | Implementation                      |
| --------------- | ----------------------- | ----------------------------------- |
| GDPR Art. 17    | Right to erasure        | DSARWorkflow.handleErasureRequest() |
| GDPR Art. 12    | Response within 30 days | SLA tracking in DSAR record         |
| GDPR Art. 17(3) | Legal hold exception    | LegalHold check before purge        |
| GDPR Art. 30    | Records of processing   | Audit log entries                   |

---

## SLA Requirements

| Metric                 | Target                   |
| ---------------------- | ------------------------ |
| Request acknowledgment | <24 hours                |
| Identity verification  | <48 hours                |
| Erasure completion     | <30 days (GDPR deadline) |
| Confirmation delivery  | <24 hours after erasure  |

---

## Success Metrics

| KPI                       | Target                  |
| ------------------------- | ----------------------- |
| DSAR completion rate      | 100% within SLA         |
| Legal hold enforcement    | 100% (no violations)    |
| Audit trail completeness  | 100% of erasures logged |
| Data subject satisfaction | >90% (survey)           |

---

## Related Flows

- **FLOW-039**: Document Search (search indexes purged)
- **FLOW-028**: Audit Logging (erasure events logged)
- **FLOW-029**: Encryption Key Management (key rotation after purge)

---

## Implementation Tasks

| Task               | Sprint | Status      |
| ------------------ | ------ | ----------- |
| IFC-140            | 11     | IN PROGRESS |
| IFC-155 (purge)    | 12     | COMPLETED   |
| **Privacy Router** | TBD    | NOT STARTED |
| **DSAR UI**        | TBD    | NOT STARTED |

---

_Flow documented: 2026-01-31_ _Last updated: 2026-01-31_
