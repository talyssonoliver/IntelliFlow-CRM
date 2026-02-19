# packages/domain — Domain Models (DDD)

## Critical Rule

**Domain code NEVER depends on infrastructure.** No imports from `packages/adapters`, `packages/db`, or `apps/*`. Enforced by architecture tests in `packages/architecture-tests/` — violations fail CI.

## DRY Enum Pattern

Domain defines canonical const arrays. All other layers derive from these:

```typescript
// packages/domain/src/crm/lead/Lead.ts
export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', ...] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
```

Validators derive Zod schemas: `z.enum(LEAD_STATUSES)`
Consistency enforced by `packages/validators/__tests__/enum-consistency.test.ts`.

### Entities with DRY Enums

Lead (LeadStatus, LeadSource), Contact (ContactStatus), Opportunity (OpportunityStage), Task (TaskStatus, TaskPriority), Case (CaseStatus, CasePriority, CaseTaskStatus), Appointment (AppointmentStatus, AppointmentType), Ticket (TicketStatus, TicketPriority, SLAStatus).

## Architecture Layer Order

```
Domain → Validators → Application → Database → Adapters → API → UI
```

Domain is the innermost layer. It defines:
- Entities and value objects
- Domain events (`src/events/`)
- Repository interfaces (ports)
- Business rules and invariants

## Stale Dist Fix

Vitest 4.x resolves `@intelliflow/domain` from `dist/index.mjs` (package.json exports), NOT the vitest.config alias. New exports appear `undefined` for static imports but work with dynamic `import()`.

**Fix**: `pnpm --filter @intelliflow/domain build` after adding/changing barrel exports in `src/index.ts`. **Always rebuild** affected package after modifying barrel exports.

## Domain Events

- Publish events AFTER transaction commits
- Transactional Outbox Pattern
- Idempotency keys on all handlers
- Event catalog in `docs/events/catalog/`

## Architecture Notes

- `CHURN_RISK_LEVELS = ['CRITICAL','HIGH','MEDIUM','LOW','MINIMAL']` must match Prisma `ChurnRisk` enum
- Multi-tenancy: Almost all models need `tenantId`
