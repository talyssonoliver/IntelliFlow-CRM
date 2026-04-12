# ADR-007: Data Governance and Classification

**Status:** Accepted

**Date:** 2025-12-20

**Deciders:** Legal Ops, Security Engineer, Tech Lead, Data Protection Officer

**Technical Story:** IFC-135, IFC-140, GOV-001

## Context and Problem Statement

IntelliFlow CRM handles sensitive legal data including client information, case
details, attorney-client privileged communications, and personally identifiable
information (PII). We need a comprehensive data governance framework that
classifies data by sensitivity, implements appropriate retention policies,
supports legal hold requirements, enables Data Subject Access Requests (DSAR),
and ensures compliance with GDPR, CCPA, and legal industry regulations. How
should we design and implement data governance to balance security, compliance,
and operational efficiency?

## Decision Drivers

- **Compliance**: GDPR, CCPA, attorney-client privilege, ISO 42001
- **Data Classification**: Automatic and manual classification by sensitivity
- **Retention Policies**: Enforce retention schedules per data type and
  jurisdiction
- **Legal Hold**: Support litigation hold overriding retention policies
- **DSAR**: Respond to subject access requests within 30 days
- **Data Residency**: Support EU/US/multi-region data storage requirements
- **Encryption**: Encrypt sensitive data at rest and in transit
- **Auditability**: Track all data access, modifications, and deletions
- **Automation**: Minimize manual governance tasks

## Considered Options

- **Option 1**: Manual data classification with spreadsheet tracking
- **Option 2**: Database-driven classification with automated retention
- **Option 3**: Third-party data governance platform (OneTrust, BigID)
- **Option 4**: Built-in governance with Prisma + Supabase RLS + metadata
- **Option 5**: Hybrid approach (built-in core + external DLP tools)

## Decision Outcome

Chosen option: **"Built-in governance with Prisma + Supabase RLS + metadata"**,
because it provides the best integration with our existing stack while
maintaining full control over data handling. We will use database-level metadata
columns for classification, retention policies enforced via scheduled jobs,
legal hold flags to prevent deletion, and automated DSAR workflows built on
tRPC. Third-party DLP tools can be added later for enhanced scanning.

### Positive Consequences

- **Tight Integration**: Governance built into data layer (Prisma/Supabase)
- **Automatic Enforcement**: RLS policies enforce tenant isolation
- **Cost Effective**: No third-party SaaS fees
- **Developer Control**: Full control over governance logic
- **Type Safety**: Prisma types include governance metadata
- **Auditability**: All changes tracked via domain events
- **DSAR Automation**: Built on existing tRPC infrastructure
- **Retention Automation**: Scheduled jobs clean up expired data

### Negative Consequences

- **Development Effort**: Must build governance features from scratch
- **Testing Complexity**: Must test retention, legal hold, DSAR workflows
- **Policy Management**: UI required for managing classification rules
- **Limited DLP**: No advanced data loss prevention scanning
- **Manual Updates**: Classification rules require manual updates

## Pros and Cons of the Options

### Manual classification

Track data classification in spreadsheets.

- Good, because it requires no infrastructure
- Bad, because it's error-prone and unscalable
- Bad, because it can't enforce policies automatically
- Bad, because audit trails are manual

### Database-driven classification

Use database columns for classification metadata.

- Good, because it's simple and performant
- Good, because it integrates with existing schema
- Good, because queries can filter by classification
- Bad, because it requires schema changes
- Bad, because classification logic is manual

### Third-party platform

Use OneTrust, BigID, or similar.

- Good, because it provides pre-built governance workflows
- Good, because it has advanced DLP scanning
- Good, because it supports DSAR automation
- Bad, because it adds significant cost ($10k-$100k/year)
- Bad, because it requires integration effort
- Bad, because vendor lock-in

### Built-in governance

Build governance into Prisma + Supabase.

- Good, because it's fully integrated with our stack
- Good, because it's cost-effective
- Good, because we control the entire workflow
- Bad, because it requires development effort
- Bad, because we must maintain governance code

### Hybrid approach

Built-in core + external DLP tools.

- Good, because it balances control and advanced features
- Good, because DLP can be added incrementally
- Bad, because it adds complexity
- Bad, because integration is required

## Implementation Notes

### Data Classification Tiers

Four classification levels based on sensitivity:

| Tier             | Description                                      | Examples                            | Retention | Encryption                      |
| ---------------- | ------------------------------------------------ | ----------------------------------- | --------- | ------------------------------- |
| **Public**       | Non-sensitive data safe for public disclosure    | Marketing content, blog posts       | 7 years   | In transit                      |
| **Internal**     | Internal business data (not client-confidential) | Lead data, analytics, logs          | 3 years   | At rest + transit               |
| **Confidential** | Client data and business-sensitive information   | Case details, invoices, contracts   | 10 years  | At rest + transit               |
| **Privileged**   | Attorney-client privileged communications        | Legal advice, case strategy, emails | Permanent | At rest + transit + field-level |

### Database Schema

Add governance metadata to all tables:

```sql
-- Add governance columns to existing tables
ALTER TABLE leads ADD COLUMN data_classification VARCHAR(50) NOT NULL DEFAULT 'internal';
ALTER TABLE leads ADD COLUMN retention_policy VARCHAR(100) NOT NULL DEFAULT 'default-3-years';
ALTER TABLE leads ADD COLUMN legal_hold BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN retention_expires_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN data_residency VARCHAR(10) NOT NULL DEFAULT 'US';

-- Governance metadata table
CREATE TABLE data_governance_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  entity_type VARCHAR(255) NOT NULL, -- 'leads', 'cases', 'emails'
  classification VARCHAR(50) NOT NULL, -- 'public', 'internal', 'confidential', 'privileged'
  retention_period_days INTEGER NOT NULL,
  auto_delete_enabled BOOLEAN NOT NULL DEFAULT true,
  legal_hold_override BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Legal holds table
CREATE TABLE legal_holds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  case_id UUID REFERENCES cases(id),
  entity_type VARCHAR(255) NOT NULL,
  entity_id UUID NOT NULL,
  reason TEXT NOT NULL,
  placed_by UUID NOT NULL REFERENCES users(id),
  placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES users(id)
);

-- DSAR requests table
CREATE TABLE dsar_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  subject_email VARCHAR(255) NOT NULL,
  request_type VARCHAR(50) NOT NULL, -- 'access', 'delete', 'rectify', 'export'
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'rejected'
  identity_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id),
  results JSONB,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ NOT NULL -- 30 days from created_at
);
```

### Automatic Classification

Classify data on creation using rules:

```typescript
// packages/application/src/services/classification.service.ts
export class DataClassificationService {
  private rules: ClassificationRule[] = [
    {
      field: 'email',
      pattern: /attorney|lawyer|legal/i,
      classification: 'confidential',
    },
    {
      field: 'subject',
      pattern: /privilege|confidential/i,
      classification: 'privileged',
    },
    {
      entity: 'case',
      classification: 'confidential',
    },
    {
      entity: 'lead',
      classification: 'internal',
    },
  ];

  classifyLead(lead: { email: string; source: string }): DataClassification {
    // Check if email contains privileged keywords
    for (const rule of this.rules) {
      if (rule.field && lead[rule.field as keyof typeof lead]) {
        const value = String(lead[rule.field as keyof typeof lead]);
        if (rule.pattern?.test(value)) {
          return rule.classification;
        }
      }
    }

    return 'internal'; // Default classification
  }

  getRetentionPolicy(classification: DataClassification): {
    retention_period_days: number;
    auto_delete_enabled: boolean;
  } {
    const policies: Record<DataClassification, any> = {
      public: { retention_period_days: 2555, auto_delete_enabled: true }, // 7 years
      internal: { retention_period_days: 1095, auto_delete_enabled: true }, // 3 years
      confidential: { retention_period_days: 3650, auto_delete_enabled: false }, // 10 years, manual
      privileged: { retention_period_days: 36500, auto_delete_enabled: false }, // 100 years, never auto-delete
    };

    return policies[classification];
  }
}
```

### Retention Enforcement

Scheduled job to delete expired data:

```typescript
// apps/ai-worker/src/workers/retention.worker.ts
import { Worker } from 'bullmq';
import { prisma } from '@intelliflow/db';

export const retentionWorker = new Worker(
  'retention-cleanup',
  async (job) => {
    const now = new Date();

    // Find expired records not on legal hold
    const expiredLeads = await prisma.lead.findMany({
      where: {
        retention_expires_at: { lte: now },
        legal_hold: false,
        data_classification: { in: ['public', 'internal'] }, // Only auto-delete non-privileged
      },
    });

    // Soft delete (keep for audit)
    for (const lead of expiredLeads) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          deleted_at: now,
          deleted_by: 'retention-worker',
          deletion_reason: 'retention-policy-expired',
        },
      });

      // Log deletion event
      await logDataDeletion({
        entity_type: 'lead',
        entity_id: lead.id,
        classification: lead.data_classification,
        reason: 'retention-policy',
      });
    }

    return { deleted_count: expiredLeads.length };
  },
  {
    connection: redisConnection,
  }
);

// Schedule daily at 2am
await retentionQueue.add(
  'cleanup',
  {},
  {
    repeat: { pattern: '0 2 * * *' },
  }
);
```

### Legal Hold

Prevent deletion of records under legal hold:

```typescript
// packages/application/src/usecases/legal-hold.usecase.ts
export class PlaceLegalHoldUseCase {
  constructor(
    private prisma: PrismaClient,
    private eventBus: EventBusPort
  ) {}

  async execute(input: {
    tenant_id: string;
    case_id: string;
    entity_type: string;
    entity_ids: string[];
    reason: string;
    placed_by: string;
  }): Promise<void> {
    // Update entities to prevent deletion
    await this.prisma.$transaction(async (tx) => {
      // Set legal_hold flag on entities
      await tx.lead.updateMany({
        where: { id: { in: input.entity_ids }, tenant_id: input.tenant_id },
        data: { legal_hold: true },
      });

      // Record legal hold
      await tx.legalHold.createMany({
        data: input.entity_ids.map((entity_id) => ({
          tenant_id: input.tenant_id,
          case_id: input.case_id,
          entity_type: input.entity_type,
          entity_id,
          reason: input.reason,
          placed_by: input.placed_by,
        })),
      });
    });

    // Publish event
    await this.eventBus.publish(
      new LegalHoldPlacedEvent({
        case_id: input.case_id,
        entity_count: input.entity_ids.length,
      })
    );
  }
}
```

### DSAR Workflow

Automate Data Subject Access Requests:

```typescript
// packages/application/src/usecases/dsar.usecase.ts
export class ProcessDSARUseCase {
  async execute(input: { request_id: string }): Promise<DSARResult> {
    const request = await this.prisma.dsarRequest.findUnique({
      where: { id: input.request_id },
    });

    if (!request) {
      throw new Error('DSAR request not found');
    }

    // Search all tables for subject's data
    const results = {
      leads: await this.prisma.lead.findMany({
        where: { email: request.subject_email, tenant_id: request.tenant_id },
      }),
      contacts: await this.prisma.contact.findMany({
        where: { email: request.subject_email, tenant_id: request.tenant_id },
      }),
      cases: await this.prisma.case.findMany({
        where: {
          parties: { some: { email: request.subject_email } },
          tenant_id: request.tenant_id,
        },
      }),
    };

    // Update request with results
    await this.prisma.dsarRequest.update({
      where: { id: input.request_id },
      data: {
        status: 'completed',
        results: results as any,
        completed_at: new Date(),
      },
    });

    return results;
  }
}
```

### Data Residency

Support multi-region data storage:

```typescript
// packages/db/src/middleware/residency.middleware.ts
export function dataResidencyMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    // For create operations, set data_residency based on tenant
    if (params.action === 'create') {
      const tenant = await getTenantSettings();

      params.args.data = {
        ...params.args.data,
        data_residency: tenant.data_residency || 'US',
      };
    }

    return next(params);
  };
}
```

### Encryption

Field-level encryption for privileged data:

```typescript
// packages/db/src/encryption/field-encryption.ts
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.FIELD_ENCRYPTION_KEY!;
const ALGORITHM = 'aes-256-gcm';

export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv
  );

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptField(ciphertext: string): string {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    Buffer.from(ivHex, 'hex')
  );

  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

### Validation Criteria

- [x] Data classification schema added to database
- [x] Automatic classification working on record creation
- [x] Retention policies defined per classification tier
- [x] Scheduled job deleting expired data
- [x] Legal hold prevents deletion
- [x] DSAR workflow functional
- [x] Field-level encryption for privileged data
- [x] Data residency metadata tracked
- [x] Audit log for all governance actions
- [x] Documentation and compliance attestation

### Testing

Governance tests:

```typescript
// tests/governance/retention.spec.ts
describe('Retention Policy', () => {
  it('should delete expired internal leads not on legal hold', async () => {
    // Create expired lead
    const lead = await createLead({
      classification: 'internal',
      retention_expires_at: new Date('2020-01-01'),
      legal_hold: false,
    });

    // Run retention job
    await retentionWorker.processJob({});

    // Verify deletion
    const result = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(result?.deleted_at).toBeTruthy();
  });

  it('should NOT delete leads on legal hold', async () => {
    const lead = await createLead({
      classification: 'internal',
      retention_expires_at: new Date('2020-01-01'),
      legal_hold: true,
    });

    await retentionWorker.processJob({});

    const result = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(result?.deleted_at).toBeNull();
  });
});
```

### Rollback Plan

If built-in governance proves insufficient:

1. Export data to third-party governance platform (OneTrust)
2. Use platform's automated classification and retention
3. Keep our DSAR workflow but delegate scanning to platform
4. Maintain audit log integration for compliance

## Links

- [GDPR Documentation](https://gdpr.eu/)
- [CCPA Requirements](https://oag.ca.gov/privacy/ccpa)
- [ISO 42001 AI Governance](https://www.iso.org/standard/81230.html)
- [Supabase RLS](https://supabase.com/docs/guides/auth/row-level-security)
- Related: [ADR-004 Multi-tenancy](./ADR-004-multi-tenancy.md)
- Related: [ADR-008 Audit Logging](./ADR-008-audit-logging.md)
- [Sprint Plan: IFC-140](../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)

## References

- [Data Classification Best Practices](https://www.nist.gov/publications/guide-protecting-confidentiality-personally-identifiable-information-pii)
- [Legal Hold Requirements](https://www.aba.com/tools-resources/legal-hold-best-practices)
- [DSAR Response Templates](https://gdpr.eu/data-subject-access-request/)
