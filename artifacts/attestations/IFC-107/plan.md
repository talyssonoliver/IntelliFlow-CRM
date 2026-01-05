# IFC-107: Implementation Plan

## Phase 1: Architect (This Document)

### Approach
Implement comprehensive test coverage for all Prisma repositories following existing patterns from PrismaLeadRepository.

### Technical Design

#### Repository Pattern
```typescript
// Domain port (packages/application)
interface LeadRepository {
  save(lead: Lead): Promise<void>;
  findById(id: LeadId): Promise<Lead | null>;
  findByEmail(email: Email): Promise<Lead | null>;
  // ... other methods
}

// Infrastructure adapter (packages/adapters)
class PrismaLeadRepository implements LeadRepository {
  constructor(private readonly prisma: PrismaClient) {}
  // Implementation using Prisma
}
```

#### Test Structure Per Repository
1. **save() tests**: Create, update, upsert scenarios
2. **findById() tests**: Found, not found, invalid ID
3. **findBy*() tests**: Various query scenarios
4. **delete() tests**: Successful delete, not found
5. **count/aggregate tests**: Group by, statistics

#### Mock Strategy
```typescript
// Mock Prisma client
vi.mock('@intelliflow/db', () => ({
  PrismaClient: vi.fn().mockImplementation(() => mockPrisma),
  Decimal: MockDecimal,
}));
```

## Phase 2: Enforcer

### Test Coverage Requirements
- Each repository: 18-25 tests
- Statement coverage: >= 90%
- Branch coverage: >= 90%

## Phase 3: Builder

### Implementation Steps
1. Validate existing PrismaLeadRepository tests (34 tests)
2. Create PrismaContactRepository tests (18 tests)
3. Create PrismaAccountRepository tests (20 tests)
4. Create PrismaOpportunityRepository tests (25 tests)
5. Create PrismaTaskRepository tests (25 tests)

## Phase 4: Gatekeeper

### Validation Commands
```bash
# Run all repository tests
pnpm --filter @intelliflow/adapters test

# Check coverage
pnpm --filter @intelliflow/adapters test:coverage
```

## Phase 5: Auditor

### Quality Checklist
- All mocks properly typed
- No flaky tests
- Proper cleanup between tests
- Error cases covered

## Completion Status
- **Completed**: 2025-12-26T14:35:00Z
- **Executor**: claude-sonnet-4-5-20250929
- **Total Tests**: 122
- **Statement Coverage**: 100%
- **Branch Coverage**: 91.45%
- **Evidence**: artifacts/attestations/IFC-107/context_ack.json
