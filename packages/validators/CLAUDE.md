# packages/validators — Zod Validation Schemas

## Purpose

Runtime validation schemas derived from domain constants. Provides type-safe
validation for API inputs, form data, and AI outputs.

## Key Pattern: DRY Enum Derivation

All enum schemas **derive from domain constants** — single source of truth:

```typescript
// packages/domain/src/crm/lead/Lead.ts — canonical source
export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', ...] as const;

// packages/validators/src/lead.ts — derives from domain
import { LEAD_STATUSES } from '@intelliflow/domain';
export const leadStatusSchema = z.enum(LEAD_STATUSES);
```

**Adding new enum values**: Edit domain const array ONLY. Validators
auto-derive.

## Entities with DRY Enum Pattern

Lead, Contact, Opportunity, Task, Case, Appointment, Ticket, Account

## Structure

```
src/
├── __tests__/             # Validation tests + enum consistency tests
├── lead.ts                # Lead schemas (status, source, scoring)
├── contact.ts             # Contact schemas
├── account.ts             # Account schemas
├── opportunity.ts         # Opportunity schemas
├── task.ts                # Task schemas
├── case.ts                # Case schemas
├── ticket.ts              # Ticket schemas
├── appointment.ts         # Appointment schemas
├── auth.ts                # Auth schemas
├── ai.ts / ai-review.ts   # AI output schemas
├── env.ts                 # Environment config schemas
├── common.ts              # Shared utility schemas
└── index.ts               # Barrel exports
```

## Key Rules

1. **Depends on**: `packages/domain/` only — derives Zod schemas from domain
   constants
2. **Architecture test**: `__tests__/enum-consistency.test.ts` enforces that
   validator enums match domain constants
3. **After modifying**: Run `pnpm --filter @intelliflow/validators build` —
   other packages import from dist
4. **Zod transforms**: Use `.transform()` carefully — can break type inference
5. **All API inputs** must use validator schemas — enforced in tRPC routers

## Testing

- `pnpm --filter @intelliflow/validators test`
- Enum consistency tests catch drift between domain and validators
- Build must pass: `pnpm --filter @intelliflow/validators build`
