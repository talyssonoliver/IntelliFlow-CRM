# Context Pack: IFC-153 – Case File Ingestion Pipeline

**Task ID:** IFC-153
**Sprint:** 12
**Section:** Case Docs
**Owner:** Backend Dev + Integration Eng (STOA-Domain)
**Created:** 2025-12-31

## Task Overview

Implement a comprehensive file ingestion pipeline for case documents that handles:
1. File uploads from web UI
2. Email attachment intake
3. Antivirus scanning
4. Metadata extraction
5. Secure storage
6. Event emission for indexing
7. Failure handling and retries

This is a **critical backend integration** that forms the foundation for document management in IntelliFlow CRM's legal case handling system.

## Pre-requisites Acknowledged

### Files Read

1. **packages/domain/src/legal/cases/case-document.ts** (626 lines)
   - Complete domain model for CaseDocument
   - Document versioning with semantic versioning (1.0.0 → 2.0.0)
   - Access control with ACL (AccessLevel: NONE, VIEW, COMMENT, EDIT, ADMIN)
   - Document classification: PUBLIC, INTERNAL, CONFIDENTIAL, PRIVILEGED
   - Document lifecycle: DRAFT → UNDER_REVIEW → APPROVED → SIGNED → ARCHIVED
   - Legal hold support (retentionUntil field prevents deletion)
   - E-signature workflows
   - Repository interface (save, findById, findByCaseId, findAccessibleByUser)
   - Domain events: DocumentCreated, DocumentVersioned, DocumentSigned, DocumentArchived, DocumentDeleted

```typescript
// Key domain model excerpt
export class CaseDocument {
  static create(params: {
    tenantId: string;
    metadata: CaseDocumentMetadata;
    storageKey: string;
    contentHash: string; // SHA-256
    mimeType: string;
    sizeBytes: number;
    createdBy: string;
  }): CaseDocument;

  grantAccess(principalId: string, principalType: 'USER' | 'ROLE' | 'TENANT', accessLevel: AccessLevel, grantedBy: string, expiresAt?: Date): void;

  placeLegalHold(retentionUntil: Date, placedBy: string): void;

  sign(signedBy: string, ipAddress: string, userAgent: string): void;
}

export interface CaseDocumentRepository {
  save(document: CaseDocument): Promise<void>;
  findById(id: string): Promise<CaseDocument | null>;
  findByCaseId(caseId: string): Promise<CaseDocument[]>;
  findAccessibleByUser(userId: string, tenantId: string): Promise<CaseDocument[]>;
  delete(id: string): Promise<void>;
}
```

2. **docs/planning/adr/ADR-007-data-governance.md** (551 lines)
   - Data classification framework
   - Four tiers: Public (7yr retention), Internal (3yr), Confidential (10yr), Privileged (permanent)
   - Automatic classification rules based on content patterns
   - Legal hold prevents deletion even when retention expires
   - DSAR (Data Subject Access Request) workflows
   - Field-level encryption for privileged data
   - Retention enforcement via scheduled jobs
   - Data residency support (US/EU multi-region)

```typescript
// Data classification excerpt from ADR
export const CLASSIFICATION_TIERS = {
  PUBLIC: { retention_days: 2555, encryption: 'transit' },
  INTERNAL: { retention_days: 1095, encryption: 'at-rest+transit' },
  CONFIDENTIAL: { retention_days: 3650, encryption: 'at-rest+transit' },
  PRIVILEGED: { retention_days: 36500, encryption: 'at-rest+transit+field-level' }
};

// Automatic classification rules
const CLASSIFICATION_RULES = [
  { field: 'email', pattern: /attorney|lawyer|legal/i, classification: 'CONFIDENTIAL' },
  { field: 'subject', pattern: /privilege|confidential/i, classification: 'PRIVILEGED' },
  { entity: 'case', default_classification: 'CONFIDENTIAL' }
];
```

3. **Framework.md** (STOA governance framework)
   - Evidence-based task completion
   - STOA ownership (Domain STOA for this task)
   - Gate profiles (Tier 1 blockers, security gates)
   - Context pack requirements
   - Artifact placement rules

4. **audit-matrix.yml**
   - Tier 1 gates: turbo-typecheck, turbo-build, turbo-test-coverage (90%)
   - Security gates: gitleaks, pnpm-audit, snyk, semgrep, trivy
   - Quality gates: eslint (max-warnings=0), prettier-check

## Environment Requirements

### Object Storage Configuration
- **Provider**: Supabase Storage (S3-compatible API)
- **Buckets**:
  - `case-documents` - Primary document storage
  - `case-documents-quarantine` - Files pending AV scan
- **Configuration**: Environment variables `SUPABASE_STORAGE_URL`, `SUPABASE_STORAGE_KEY`

### Email Inbound Baseline
- **Provider**: SendGrid Inbound Parse or AWS SES
- **Webhook**: `/api/inbound/email` endpoint for attachments
- **Processing**: Extract attachments, verify sender, create ingestion job

### Event Consumers Available
- **Event Bus**: Redis-backed event queue (BullMQ)
- **Consumers**:
  - `document-indexing-worker` - Index documents in search (Elasticsearch/pgvector)
  - `thumbnail-generator-worker` - Generate document previews
  - `ocr-worker` - Extract text from scanned documents

## Invariants Acknowledged

1. **Antivirus Scan Mandatory**: No file may enter primary storage without passing AV scan. Files must be quarantined until scan completes.

2. **Content Hash Verification**: All files must have SHA-256 hash calculated and verified on upload to detect tampering.

3. **Classification Required**: Every document must have a classification (PUBLIC/INTERNAL/CONFIDENTIAL/PRIVILEGED) before storage.

4. **Tenant Isolation**: Documents must be strictly isolated by tenant ID. No cross-tenant access.

5. **Audit Trail**: All ingestion events (upload, scan, storage, failure) must be logged with user ID, timestamp, and action.

6. **Idempotency**: Ingestion must be idempotent - re-uploading the same file (same hash) should not create duplicates.

7. **Failure Resilience**: Failed ingestion jobs must retry (3 attempts with exponential backoff) before moving to Dead Letter Queue.

8. **MIME Type Validation**: Only allowed file types (PDF, DOCX, images) may be uploaded. Executables and scripts are blocked.

9. **Size Limits**: Maximum file size 50MB for web uploads, 25MB for email attachments.

10. **Event Emission**: All successful ingestions must emit `DocumentCreatedEvent` for downstream consumers.

## Dependencies Verified

All dependencies marked as DONE:
- ✅ **IFC-152**: Case Document Domain Model (CaseDocument entity implemented)
- ✅ **IFC-144**: Document Repository Port (CaseDocumentRepository interface defined)
- ✅ **IFC-151**: Storage infrastructure (Supabase Storage configured)
- ✅ **IFC-106**: Hexagonal architecture boundaries (Domain/Application/Adapters layers defined)

## Definition of Done

1. ✅ **Upload + inbound email attachments land in storage**
   - Web upload API endpoint functional
   - Email inbound webhook processes attachments
   - Files stored in Supabase Storage

2. ✅ **AV scan gate**
   - ClamAV integration or cloud AV service
   - Quarantine bucket for unscanned files
   - Reject infected files with notification

3. ✅ **Metadata extracted**
   - MIME type detection
   - File size calculation
   - SHA-256 hash generation
   - Document classification assignment

4. ✅ **Ingestion events emitted**
   - `DocumentUploadedEvent` on receipt
   - `DocumentScannedEvent` post-AV
   - `DocumentCreatedEvent` on success
   - `DocumentIngestionFailedEvent` on error

5. ✅ **Failure handling + retries**
   - 3 retry attempts with exponential backoff (1s, 2s, 4s)
   - Dead Letter Queue for failures
   - Admin notification on DLQ entries

6. ✅ **Integration tests**
   - E2E upload flow test
   - AV scan integration test
   - Email attachment processing test
   - Failure/retry scenario tests

7. ✅ **Targets: >=99%, >=100%, >=1%**
   - Test coverage: >=99% for ingestion pipeline
   - Success rate: >=100% (all successful uploads stored)
   - Error rate: <=1% (failures handled gracefully)

## Artifacts to Produce

1. **docs/operations/runbooks/ingestion.md**
   - Operational runbook for file ingestion
   - Troubleshooting failed ingestions
   - DLQ triage procedures
   - Performance monitoring

2. **artifacts/attestations/IFC-153/context_ack.json**
   - Context acknowledgment with files read
   - Invariants acknowledged
   - Evidence hashes

## Architecture Design

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  File Ingestion Pipeline                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ├── Ingestion Sources
                              │   ├── Web Upload API (/api/documents/upload)
                              │   ├── Email Inbound Webhook (/api/inbound/email)
                              │   └── Bulk Import API (future)
                              │
                              ├── Ingestion Orchestrator
                              │   ├── Validate file (size, MIME type)
                              │   ├── Calculate content hash (SHA-256)
                              │   ├── Store in quarantine bucket
                              │   └── Enqueue AV scan job
                              │
                              ├── Antivirus Scanner
                              │   ├── ClamAV daemon integration
                              │   ├── Scan file in quarantine
                              │   ├── Tag as clean/infected
                              │   └── Move to primary or reject
                              │
                              ├── Metadata Extractor
                              │   ├── Detect MIME type
                              │   ├── Extract file properties
                              │   ├── Apply classification rules
                              │   └── Generate document metadata
                              │
                              ├── Storage Manager
                              │   ├── Supabase Storage client
                              │   ├── Store in primary bucket
                              │   ├── Generate storage key
                              │   └── Verify integrity (hash check)
                              │
                              ├── Event Emitter
                              │   ├── Publish to Redis event bus
                              │   ├── DocumentCreatedEvent
                              │   ├── DocumentScannedEvent
                              │   └── DocumentIngestionFailedEvent
                              │
                              └── Failure Handler
                                  ├── Retry with backoff (3 attempts)
                                  ├── Log failure details
                                  ├── Move to DLQ
                                  └── Send admin notification
```

### Data Flow Sequence

```
1. User uploads file via web UI
   ↓
2. POST /api/documents/upload
   - Validate JWT token (user authentication)
   - Check tenant permissions
   - Validate file size (<50MB)
   - Validate MIME type (allowed list)
   ↓
3. Ingestion Orchestrator
   - Calculate SHA-256 hash
   - Check for duplicate (hash exists?)
   - Store in quarantine bucket: `case-documents-quarantine/{tenantId}/{hash}.ext`
   - Create IngestionJob record (status: PENDING)
   ↓
4. Enqueue AV Scan Job (BullMQ)
   - Job data: { ingestionJobId, storageKey, hash }
   - Priority: HIGH
   ↓
5. AV Scanner Worker
   - Download file from quarantine
   - Run ClamAV scan
   - IF clean: Move to primary bucket
   - IF infected: Delete file, mark job FAILED
   - Update IngestionJob (status: SCANNED or INFECTED)
   ↓
6. Metadata Extraction (if scan clean)
   - Extract MIME type (using magic numbers)
   - Determine document classification (apply rules from ADR-007)
   - Extract file properties (pages, author, created date)
   ↓
7. Create CaseDocument Entity
   - CaseDocument.create({...})
   - Apply default ACL (grant creator ADMIN access)
   - Set initial status: DRAFT
   - Save to database via repository
   ↓
8. Emit DocumentCreatedEvent
   - Publish to event bus
   - Consumers: indexing-worker, thumbnail-worker, ocr-worker
   ↓
9. Update IngestionJob (status: COMPLETED)
   - Record final storage key
   - Log completion timestamp
   - Return document ID to client
```

### Failure Scenarios & Handling

| Failure | Retry Strategy | DLQ Action | User Notification |
|---------|----------------|------------|-------------------|
| Network timeout to storage | Retry 3x (1s, 2s, 4s backoff) | Move to DLQ after 3 failures | Email: "Upload failed, please retry" |
| AV scan service unavailable | Retry 3x (2s, 4s, 8s backoff) | Queue in DLQ, escalate to ops | In-app: "Scan delayed, processing..." |
| File infected | No retry | Log, delete file, notify user | In-app: "File rejected - virus detected" |
| Storage quota exceeded | No retry | Alert admin | In-app: "Storage full, contact support" |
| Invalid MIME type | No retry | Log, return 400 error | In-app: "File type not supported" |
| Duplicate hash | No retry | Return existing document ID | In-app: "File already uploaded" |

## Next Steps

1. Implement ingestion orchestrator service
2. Integrate ClamAV antivirus scanning
3. Build metadata extraction utilities
4. Create Supabase Storage adapter
5. Implement event emission system
6. Write E2E integration tests
7. Create operational runbook
8. Validate against quality gates
