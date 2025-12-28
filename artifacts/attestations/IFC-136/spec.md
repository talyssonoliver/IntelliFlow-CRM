# IFC-136: Case/Matter Aggregate Root

## Specification

### Task Overview
- **Task ID**: IFC-136
- **Section**: Domain
- **Owner**: Backend Dev + Domain Architect (STOA-Intelligence)
- **Dependencies**: IFC-002, IFC-003

### Objective
Implement a full DDD aggregate root for legal Case/Matter management including tasks, deadlines, parties, and lawyer assignments.

### Requirements

#### Functional Requirements
1. **Case Aggregate Root**
   - Case entity with status lifecycle (open, pending, active, closed, archived)
   - Case types (litigation, transactional, advisory, regulatory, criminal)
   - Billable flag and practice area
   - Client and responsible lawyer assignments

2. **Embedded Entities**
   - CaseTask: Tasks within a case with status, priority, due dates, assignments
   - Domain events for state changes

3. **Value Objects**
   - CaseId: UUID-based identifier
   - CaseTaskId: UUID-based identifier

4. **Repository Interface**
   - Full CRUD operations
   - Query by client, lawyer, status, practice area
   - Task management within case context

5. **tRPC Router**
   - Complete CRUD endpoints
   - Task management endpoints
   - Query endpoints

#### Non-Functional Requirements
- Test coverage >= 90%
- Response time <= 50ms
- Domain model correctness validated

### KPIs
| Metric | Target | Validation Method |
|--------|--------|-------------------|
| Test Coverage | >= 90% | pnpm test:coverage |
| Response Time | <= 50ms | Performance test |
| Correctness | Validated | Integration tests |

### Artifacts
- `packages/domain/src/legal/cases/Case.ts`
- `packages/domain/src/legal/cases/CaseId.ts`
- `packages/domain/src/legal/cases/CaseTaskId.ts`
- `packages/domain/src/legal/cases/CaseTask.ts`
- `packages/domain/src/legal/cases/CaseEvents.ts`
- `packages/domain/src/legal/cases/CaseRepository.ts`
- `packages/validators/src/case.ts`
- `apps/api/src/modules/legal/cases.router.ts`
- `packages/db/prisma/migrations/case.sql`

### Acceptance Criteria
- [ ] Case aggregate implements all status transitions
- [ ] CaseTask embedded entity with full lifecycle
- [ ] 8 domain events defined and emitted
- [ ] Repository interface with all required methods
- [ ] tRPC router with 12 procedures
- [ ] SQL migration with RLS policies
- [ ] 108 tests passing
