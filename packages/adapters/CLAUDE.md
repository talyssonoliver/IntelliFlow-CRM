# packages/adapters ÔÇö Infrastructure Adapters

## Purpose

Implements repository interfaces (ports) defined in the domain/application
layers. This is the outermost layer of the hexagonal architecture that connects
to real infrastructure.

## Repository Pattern

```typescript
// Domain defines the interface (port)
interface LeadRepository {
  save(lead: Lead): Promise<void>;
  findById(id: LeadId): Promise<Lead | null>;
}

// Adapters implement it
class PrismaLeadRepository implements LeadRepository {
  constructor(private prisma: PrismaClient) {}
  // Implementation using Prisma
}
```

## Container Wiring (CRITICAL)

Every adapter/service MUST be registered in `container.ts`. Static checks
(typecheck, mocked tests, lint, build) can all pass while a service is never
actually instantiated at runtime.

**When adding a new adapter:**

1. Create the class implementing the port interface
2. Register it in `container.ts`
3. Wire it in `context.ts` if it needs request context
4. Verify with a runtime check, not just typecheck

## Testing

- Prisma mock types don't support `include`/`select` relations ÔÇö cast mock data
  with `as any`
- Use `Record<string, any>` for mock repositories to avoid TS2348 "not callable"
  on vi.fn()
- For test files using `await import(...)`, use `as any` cast on the result

## Architecture Rules

- Adapters CAN depend on: domain, application, db (Prisma client), external
  libraries
- Adapters CANNOT be imported by: domain, validators
- All adapters must be tested (100% coverage target per Sprint_plan KPIs)
