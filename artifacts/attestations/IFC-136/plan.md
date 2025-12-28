# IFC-136: Implementation Plan

## Phase 1: Architect (This Document)

### Approach
Implement a complete DDD aggregate root following hexagonal architecture patterns established by Lead and Contact aggregates.

### Technical Design

#### Aggregate Structure
```
Case (Aggregate Root)
├── CaseId (Value Object)
├── CaseTask[] (Embedded Entity)
│   └── CaseTaskId (Value Object)
└── Domain Events
    ├── CaseCreated
    ├── CaseStatusChanged
    ├── CaseAssigned
    ├── CaseClosed
    ├── CaseReopened
    ├── CaseTaskAdded
    ├── CaseTaskCompleted
    └── CaseTaskRemoved
```

#### Status State Machine
```
OPEN → PENDING → ACTIVE → CLOSED → ARCHIVED
  ↑___________________|  (reopen)
```

#### Repository Interface
```typescript
interface CaseRepository {
  save(case: Case): Promise<void>;
  findById(id: CaseId): Promise<Case | null>;
  findByClientId(clientId: string): Promise<Case[]>;
  findByLawyerId(lawyerId: string): Promise<Case[]>;
  findByStatus(status: CaseStatus): Promise<Case[]>;
  findByPracticeArea(area: PracticeArea): Promise<Case[]>;
  delete(id: CaseId): Promise<void>;
}
```

#### tRPC Router Procedures
1. `create` - Create new case
2. `getById` - Get case by ID
3. `list` - List cases with filters
4. `update` - Update case details
5. `delete` - Delete case
6. `changeStatus` - Status transitions
7. `assign` - Assign lawyer
8. `addTask` - Add task to case
9. `updateTask` - Update task
10. `completeTask` - Mark task complete
11. `removeTask` - Remove task
12. `getByClient` - Cases by client

## Phase 2: Enforcer

### Test Coverage
- Value Objects: 100%
- Aggregate Root: 100%
- Domain Events: 100%
- Repository Interface: N/A (interface only)
- Validators: 100%

## Phase 3: Builder

### Implementation Steps
1. Create CaseId value object
2. Create CaseTaskId value object
3. Define domain events
4. Create CaseTask embedded entity
5. Create Case aggregate root
6. Define repository interface
7. Create Zod validators
8. Implement tRPC router
9. Create SQL migration

## Phase 4: Gatekeeper

### Validation Commands
```bash
pnpm --filter @intelliflow/domain test
pnpm --filter @intelliflow/validators test
pnpm --filter @intelliflow/api test
```

## Phase 5: Auditor

### Quality Checklist
- No infrastructure dependencies in domain
- All events immutable
- Proper encapsulation
- Business rules enforced

## Completion Status
- **Completed**: 2025-12-26T14:40:00Z
- **Executor**: claude-sonnet-4-5-20250929
- **Total Tests**: 108
- **Evidence**: artifacts/attestations/IFC-136/context_ack.json
