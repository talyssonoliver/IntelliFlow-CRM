# IFC-107: Implement Repositories and Factories

## Specification

### Task Overview
- **Task ID**: IFC-107
- **Section**: Infrastructure
- **Owner**: Backend Dev (STOA-Domain)
- **Dependencies**: IFC-101, IFC-102, IFC-103, IFC-104, IFC-105

### Objective
Implement repository pattern for all domain aggregates using Prisma ORM, ensuring clean separation between domain and infrastructure layers per hexagonal architecture.

### Requirements

#### Functional Requirements
1. **Repository Implementations**
   - PrismaLeadRepository (existing, validate)
   - PrismaContactRepository
   - PrismaAccountRepository
   - PrismaOpportunityRepository
   - PrismaTaskRepository

2. **Repository Interface Compliance**
   - All repositories implement domain-defined interfaces
   - CRUD operations (save, findById, findBy*, delete)
   - Query methods for business operations
   - Proper entity reconstitution from Prisma records

3. **Factory Pattern**
   - Entity factories for complex object creation
   - Value object instantiation helpers
   - Domain event emission on entity creation

#### Non-Functional Requirements
- Test coverage >= 90%
- No domain layer dependencies on Prisma
- Consistent error handling across repositories

### KPIs
| Metric | Target | Validation Method |
|--------|--------|-------------------|
| Test Coverage | >= 90% | pnpm test:coverage |
| Tests Passing | 100% | pnpm test |
| Domain Isolation | 100% | Architecture tests |

### Artifacts
- `packages/adapters/__tests__/PrismaLeadRepository.test.ts`
- `packages/adapters/__tests__/PrismaContactRepository.test.ts`
- `packages/adapters/__tests__/PrismaAccountRepository.test.ts`
- `packages/adapters/__tests__/PrismaOpportunityRepository.test.ts`
- `packages/adapters/__tests__/PrismaTaskRepository.test.ts`

### Acceptance Criteria
- [ ] All 5 repository test files created
- [ ] 122+ tests passing
- [ ] Statement coverage >= 90%
- [ ] Branch coverage >= 90%
- [ ] No direct Prisma imports in domain package
