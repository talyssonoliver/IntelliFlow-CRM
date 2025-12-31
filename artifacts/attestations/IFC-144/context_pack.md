# Context Pack: IFC-144 - Email Infrastructure & Webhook Handling

**Task ID**: IFC-144
**Run ID**: 20251230-184952-IFC-144
**Created**: 2025-12-30T18:49:52Z
**Agent**: Claude Sonnet 4.5

---

## Pre-requisite Files Read

### 1. Framework (artifacts/sprint0/codex-run/Framework.md)

**Purpose**: STOA Framework v4.3 - Governance model for task execution

**Key Excerpts**:

```markdown
## 2) STOA Roles and Responsibilities

| STOA | Primary Mandate | Typical Scope |
|------|-----------------|---------------|
| **Foundation STOA** | Infra, tooling, CI, environments | docker, CI configs, monorepo tooling |
| **Domain STOA** | Business/domain correctness, API/data-model | tRPC routes, domain packages, DB schema |
| **Intelligence STOA** | AI/ML logic, chains/agents | ai-worker, prompts, embeddings |
| **Security STOA** | Threat model, secret hygiene | authn/authz, secret scanning |
| **Quality STOA** | Test strategy, coverage | unit/integration/e2e, lint/typecheck |

## 5) Gate Profiles

Baseline Gates (Always Required - Tier 1):
- turbo-typecheck: pnpm run typecheck (Exit 0)
- turbo-build: pnpm run build (Exit 0)
- turbo-test-coverage: pnpm exec turbo run test:coverage (coverage_min: 90)
- eslint-max-warnings-0: pnpm exec eslint --max-warnings=0 . (max_warnings: 0)
```

---

### 2. Hexagonal Architecture (docs/architecture/hex-boundaries.md)

**Purpose**: Defines layer separation and dependency rules

**Key Excerpts**:

```markdown
## Layer Structure

packages/domain/     - Entities, Value Objects, Domain Events (NO external deps)
packages/application/ - Use Cases, Port interfaces, Application Services
packages/adapters/   - Repository implementations, External API clients
apps/               - HTTP handlers, tRPC routers, Workers, UI

## Dependency Rules

- Domain Layer: CANNOT import adapters, application, apps
- Application Layer: CAN import domain only
- Adapters Layer: CAN import domain, application
- Apps Layer: CAN import all packages (composition root)

## Port Definitions

Repository Ports: packages/application/src/ports/repositories/
External Service Ports: packages/application/src/ports/external/
```

---

### 3. Domain Events Contracts (docs/events/contracts-v1.yaml)

**Purpose**: Event catalog with schemas, versioning, and compatibility rules

**Key Excerpts**:

```yaml
version: "1.0.0"
compatibility_mode: "backward"

events:
  LeadCreated:
    version: "1.0"
    category: lead
    idempotency_key: "LeadCreated:{leadId}"
    schema:
      required: [leadId, email, source, tenantId, createdAt]

publishing:
  outbox:
    enabled: true
    polling_interval_ms: 100
    max_retries: 3
    retry_backoff_ms: [1000, 5000, 30000]

  idempotency:
    enabled: true
    cache_ttl_hours: 24

  dlq:
    enabled: true
    max_age_hours: 168
    alert_threshold: 100
```

---

### 4. Notification Service Port (packages/application/src/ports/external/NotificationServicePort.ts)

**Purpose**: Existing port for email/SMS/push notifications

**Key Excerpts**:

```typescript
export interface EmailNotificationOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody?: string;
  textBody?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType: string;
  encoding?: 'base64' | 'utf-8';
}

export interface NotificationServicePort {
  sendEmail(options: EmailNotificationOptions): Promise<Result<NotificationResult, DomainError>>;
  sendSms(options: SmsNotificationOptions): Promise<Result<NotificationResult, DomainError>>;
  sendPush(options: PushNotificationOptions): Promise<Result<NotificationResult, DomainError>>;
  validateEmail(email: string): boolean;
  validatePhoneNumber(phoneNumber: string): boolean;
}
```

---

### 5. tRPC Configuration (apps/api/src/trpc.ts)

**Purpose**: tRPC setup with authentication middleware

**Key Excerpts**:

```typescript
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);
export const adminProcedure = t.procedure.use(isAuthed).use(isAdmin);

// Performance warning for slow requests (>50ms as per KPI)
if (durationMs > 50) {
  console.warn(`[tRPC] SLOW REQUEST: ${path} took ${durationMs}ms (target: <50ms)`);
}
```

---

### 6. DLQ Triage Runbook (docs/operations/runbooks/dlq-triage.md)

**Purpose**: Operational procedures for event failures and retry logic

**Key Excerpts**:

```markdown
## 2. DLQ Monitoring & Alerting

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| DLQ Depth | 0 messages | >5 messages for >5 min |
| DLQ Drain Success | >95% | <95% success rate |
| Retry Success Rate | >90% | <90% on first retry |
| MTTR | <30 min | Alert when incident declared |

## 5. Automated Retry & Backoff Strategy

const RETRY_CONFIG = {
  maxRetries: 3,
  backoffMs: [1000, 5000, 30000], // 1s, 5s, 30s
  jitterFactor: 0.1,
};

Attempt 1: Immediate
Attempt 2: After 1 second + jitter
Attempt 3: After 5 seconds + jitter
Attempt 4 (DLQ): After 30 seconds + jitter, then dead letter
```

---

### 7. Audit Matrix (audit-matrix.yml)

**Purpose**: Canonical tool definitions for quality gates

**Key Excerpts**:

```yaml
tools:
  - id: turbo-typecheck
    tier: 1
    enabled: true
    required: true
    command: 'pnpm run typecheck'

  - id: turbo-test-coverage
    tier: 1
    enabled: true
    required: true
    command: 'pnpm exec turbo run test:coverage'
    thresholds:
      coverage_min: 90

  - id: gitleaks
    tier: 1
    enabled: true
    required: true
    owner: 'Security'
    command: 'python tools/audit/gitleaks_scan.py'
```

---

## Architecture Invariants Acknowledged

1. **Hexagonal Architecture**:
   - Email messaging ports MUST be defined in `packages/application/src/ports/external/`
   - Adapter implementations MUST live in `packages/adapters/src/messaging/email/`
   - Domain layer CANNOT import infrastructure packages (Nodemailer, SendGrid, etc.)
   - Apps layer wires ports to adapters

2. **Event-Driven Architecture**:
   - Webhook events MUST follow transactional outbox pattern
   - All event handlers MUST be idempotent
   - Retry backoff: [1s, 5s, 30s] with jitter
   - DLQ threshold: >5 messages triggers alert

3. **Test Coverage Requirements**:
   - Overall: >90% (enforced by CI)
   - Domain layer: >95%
   - Application layer: >90%
   - Coverage gates MUST fail the build if thresholds not met

4. **Performance Targets**:
   - API response time: p95 <100ms, p99 <200ms
   - Email send latency: <2s (from IFC-144 definition)
   - Webhook processing: <200ms per event

5. **Security Requirements**:
   - SPF/DKIM/DMARC MUST be configured for outbound email
   - Webhook signatures MUST be verified (HMAC-SHA256)
   - Idempotency keys MUST be used to prevent duplicate processing
   - Secrets MUST NOT be logged or committed

6. **Type Safety**:
   - All enum values MUST follow DRY pattern (domain → validators → application)
   - tRPC endpoints MUST use Zod schemas for input validation
   - All external service responses MUST be typed

7. **Documentation Requirements**:
   - OpenAPI spec MUST document all public endpoints
   - Versioning strategy: v1 baseline
   - Breaking changes require version bump
   - Schema evolution follows backward compatibility rules

---

## Task-Specific Context

**IFC-144 Requirements**:

1. **Outbound Email**: SPF/DKIM/DMARC signing
2. **Inbound Email**: Parsing with attachment handling
3. **Webhooks**: Idempotency + retries + signature verification
4. **OpenAPI**: Version 1 specification for public API
5. **Baseline Email**: End-to-end send/receive tested

**KPIs**:
- Test coverage: >=95%
- Email delivery success: >=99%
- Idempotency: >=100% (no duplicates)

**Dependencies Verified**:
- IFC-137 (DONE) - Notification service MVP
- IFC-003 (DONE) - tRPC API foundation
- IFC-150 (DONE) - Domain events infrastructure
- IFC-151 (DONE) - Event consumers framework
- IFC-106 (DONE) - Hexagonal module boundaries

---

## Files to Create

**Ports (Application Layer)**:
- `packages/application/src/ports/external/EmailServicePort.ts`
- `packages/application/src/ports/external/WebhookServicePort.ts`

**Adapters (Infrastructure Layer)**:
- `packages/adapters/src/messaging/email/outbound.ts`
- `packages/adapters/src/messaging/email/inbound.ts`
- `packages/adapters/src/messaging/email/EmailServiceAdapter.ts`

**Webhooks Framework**:
- `artifacts/misc/webhooks/framework.ts`
- `artifacts/misc/webhooks/signature-verification.ts`
- `artifacts/misc/webhooks/idempotency-cache.ts`

**OpenAPI Specification**:
- `artifacts/misc/api-spec/openapi-v1.yaml`

**Tests**:
- `packages/adapters/src/messaging/email/__tests__/outbound.test.ts`
- `packages/adapters/src/messaging/email/__tests__/inbound.test.ts`
- `packages/adapters/src/messaging/email/__tests__/EmailServiceAdapter.test.ts`
- `artifacts/misc/webhooks/__tests__/framework.test.ts`

**Evidence**:
- `artifacts/attestations/IFC-144/context_ack.json`
- `artifacts/attestations/IFC-144/test_output.txt`
- `artifacts/attestations/IFC-144/coverage_report.json`

---

## End of Context Pack
