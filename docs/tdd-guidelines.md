# TDD Guidelines

## Overview

This document outlines the Test-Driven Development (TDD) process for the
IntelliFlow CRM project. TDD is a core practice that ensures code quality,
maintainability, and confidence in refactoring.

## TDD Workflow: Red-Green-Refactor

The TDD cycle follows three distinct phases:

### 1. Red Phase - Write a Failing Test

- Write a test for the next bit of functionality you want to add
- Run the test suite and verify the new test fails (red)
- Ensure the test fails for the right reason (not due to syntax errors or
  missing dependencies)

**Example:**

```typescript
// packages/domain/src/crm/lead/__tests__/LeadScore.test.ts
describe('LeadScore', () => {
  it('should reject scores below 0', () => {
    expect(() => LeadScore.create(-1)).toThrow(InvalidLeadScoreError);
  });
});
```

### 2. Green Phase - Write Minimal Code to Pass

- Write just enough code to make the test pass
- Focus on functionality, not perfection
- Run the test suite and verify all tests pass (green)

**Example:**

```typescript
// packages/domain/src/crm/lead/LeadScore.ts
export class LeadScore extends ValueObject {
  private constructor(private readonly value: number) {
    if (value < 0) {
      throw new InvalidLeadScoreError(value);
    }
  }

  static create(value: number): LeadScore {
    return new LeadScore(value);
  }
}
```

### 3. Refactor Phase - Improve Code Quality

- Refactor the code to improve design while keeping tests green
- Apply SOLID principles (see below)
- Remove duplication
- Improve naming and clarity
- Run tests frequently to ensure no regressions

**Example:**

```typescript
// Refactored with better error messages and upper bound validation
export class LeadScore extends ValueObject {
  private static readonly MIN_SCORE = 0;
  private static readonly MAX_SCORE = 100;

  private constructor(private readonly value: number) {
    this.validate();
  }

  static create(value: number): LeadScore {
    return new LeadScore(value);
  }

  private validate(): void {
    if (this.value < LeadScore.MIN_SCORE || this.value > LeadScore.MAX_SCORE) {
      throw new InvalidLeadScoreError(
        `Lead score must be between ${LeadScore.MIN_SCORE} and ${LeadScore.MAX_SCORE}, got ${this.value}`
      );
    }
  }

  getValue(): number {
    return this.value;
  }
}
```

## Coverage Requirements

Coverage thresholds are enforced by CI and will fail builds if not met.

| Layer                 | Coverage Requirement   | Enforcement             |
| --------------------- | ---------------------- | ----------------------- |
| **Domain Layer**      | ≥95% line coverage     | CI enforced (hard fail) |
| **Application Layer** | ≥90% line coverage     | CI enforced (hard fail) |
| **API Routes**        | ≥85% endpoint coverage | CI enforced (hard fail) |
| **Overall Project**   | ≥90% line coverage     | CI enforced (hard fail) |
| **Unit Tests**        | ≥90% line coverage     | Team standard           |
| **Integration Tests** | ≥80% endpoint coverage | Team standard           |

### Viewing Coverage Reports

```bash
# Generate coverage report
pnpm run test:unit -- --coverage

# View HTML report
open artifacts/coverage/index.html

# View summary in terminal
pnpm run test:coverage
```

### Coverage Configuration

Coverage is configured in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      lines: 90,
      functions: 90,
      branches: 90,
      statements: 90,
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.ts',
        '**/*.d.ts',
        '**/types.ts',
        '**/__tests__/**',
      ],
    },
  },
});
```

## Test Categories

IntelliFlow CRM uses three categories of tests, each serving a distinct purpose:

| Category              | Purpose                                                               | Tools            | Speed                   | Coverage Target        |
| --------------------- | --------------------------------------------------------------------- | ---------------- | ----------------------- | ---------------------- |
| **Unit Tests**        | Test individual functions, classes, and modules in isolation          | Vitest           | Fast (<1s per suite)    | ≥90% line coverage     |
| **Integration Tests** | Test interactions between components, API endpoints, database queries | Vitest + Test DB | Medium (1-5s per suite) | ≥80% endpoint coverage |
| **E2E Tests**         | Test complete user workflows through the UI                           | Playwright       | Slow (10-60s per test)  | Critical paths only    |

### Unit Tests

**Purpose**: Validate individual units of code in isolation.

**Characteristics**:

- No external dependencies (database, network, file system)
- Use mocks/stubs for dependencies
- Fast execution (milliseconds)
- High coverage of edge cases

**Example:**

```typescript
// packages/domain/src/crm/lead/__tests__/Email.test.ts
import { describe, it, expect } from 'vitest';
import { Email } from '../Email';

describe('Email Value Object', () => {
  describe('creation', () => {
    it('should create valid email', () => {
      const email = Email.create('test@example.com');
      expect(email.getValue()).toBe('test@example.com');
    });

    it('should reject invalid email format', () => {
      expect(() => Email.create('invalid-email')).toThrow();
    });

    it('should normalize email to lowercase', () => {
      const email = Email.create('TEST@EXAMPLE.COM');
      expect(email.getValue()).toBe('test@example.com');
    });
  });

  describe('equality', () => {
    it('should consider emails equal if values match', () => {
      const email1 = Email.create('test@example.com');
      const email2 = Email.create('test@example.com');
      expect(email1.equals(email2)).toBe(true);
    });
  });
});
```

**Location**: `packages/*/src/**/__tests__/`

**Naming Convention**: `{ClassName}.test.ts` or `{functionName}.test.ts`

### Integration Tests

**Purpose**: Validate interactions between components and external systems.

**Characteristics**:

- Use test database (isolated from production)
- Test API endpoints end-to-end
- Verify database queries and transactions
- Medium execution time (seconds)

**Example:**

```typescript
// apps/api/src/modules/lead/__tests__/lead.router.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { appRouter } from '../../router';
import { createTestContext } from '../../test/setup';

describe('Lead Router', () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(async () => {
    const ctx = await createTestContext();
    caller = appRouter.createCaller(ctx);
  });

  describe('lead.create', () => {
    it('should create a new lead', async () => {
      const input = {
        name: 'John Doe',
        email: 'john@example.com',
        source: 'WEBSITE',
      };

      const result = await caller.lead.create(input);

      expect(result.id).toBeDefined();
      expect(result.name).toBe('John Doe');
      expect(result.email).toBe('john@example.com');
    });

    it('should reject duplicate email', async () => {
      const input = {
        name: 'John Doe',
        email: 'john@example.com',
        source: 'WEBSITE',
      };

      await caller.lead.create(input);

      await expect(caller.lead.create(input)).rejects.toThrow(
        'Lead with this email already exists'
      );
    });
  });
});
```

**Location**: `apps/*/src/**/__tests__/` or `tests/integration/`

**Naming Convention**: `{routerName}.router.test.ts` or
`{feature}.integration.test.ts`

### E2E Tests

**Purpose**: Validate complete user workflows from the UI perspective.

**Characteristics**:

- Use real browser (Chromium, Firefox, WebKit)
- Test critical user journeys
- Verify UI interactions and visual elements
- Slow execution time (seconds to minutes)

**Example:**

```typescript
// tests/e2e/lead-capture.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Lead Capture Flow', () => {
  test('should capture lead from website form', async ({ page }) => {
    await page.goto('/');

    // Fill form
    await page.fill('[name="name"]', 'Jane Smith');
    await page.fill('[name="email"]', 'jane@example.com');
    await page.fill('[name="company"]', 'Acme Corp');

    // Submit
    await page.click('button[type="submit"]');

    // Verify success
    await expect(page.locator('.success-message')).toBeVisible();
    await expect(page.locator('.success-message')).toContainText(
      'Thank you for your interest'
    );
  });

  test('should show validation errors for invalid email', async ({ page }) => {
    await page.goto('/');

    await page.fill('[name="email"]', 'invalid-email');
    await page.click('button[type="submit"]');

    await expect(page.locator('.error-message')).toContainText(
      'Please enter a valid email'
    );
  });
});
```

**Location**: `tests/e2e/`

**Naming Convention**: `{feature}.spec.ts`

## Test File Locations

Test files are organized according to the following conventions:

```
intelliFlow-CRM/
├── packages/
│   ├── domain/
│   │   └── src/
│   │       └── crm/
│   │           └── lead/
│   │               ├── __tests__/               # Unit tests for domain
│   │               │   ├── Lead.test.ts
│   │               │   ├── LeadId.test.ts
│   │               │   ├── Email.test.ts
│   │               │   └── LeadScore.test.ts
│   │               ├── Lead.ts
│   │               ├── LeadId.ts
│   │               └── Email.ts
│   ├── application/
│   │   └── __tests__/                           # Unit tests for use cases
│   │       ├── CreateLeadUseCase.test.ts
│   │       └── QualifyLeadUseCase.test.ts
│   └── adapters/
│       └── __tests__/                           # Unit tests for adapters
│           ├── PrismaLeadRepository.test.ts
│           └── InMemoryLeadRepository.test.ts
├── apps/
│   ├── api/
│   │   └── src/
│   │       └── modules/
│   │           └── lead/
│   │               └── __tests__/               # Integration tests for API
│   │                   └── lead.router.test.ts
│   └── web/
│       └── src/
│           └── app/
│               └── leads/
│                   └── __tests__/               # Unit tests for components
│                       └── LeadForm.test.tsx
├── tests/
│   ├── integration/                             # Cross-module integration tests
│   │   ├── lead-workflow.test.ts
│   │   └── database-transactions.test.ts
│   └── e2e/                                     # End-to-end tests
│       ├── lead-capture.spec.ts
│       ├── lead-qualification.spec.ts
│       └── opportunity-conversion.spec.ts
└── vitest.config.ts                             # Vitest configuration
```

### Location Guidelines

1. **Co-locate unit tests**: Place `__tests__` directory next to the code being
   tested
2. **Integration tests**: Use `apps/*/src/**/__tests__/` for API/module
   integration tests
3. **Shared integration tests**: Use `tests/integration/` for cross-module tests
4. **E2E tests**: Always use `tests/e2e/` for Playwright tests

## Vitest Configuration

### Running Tests

```bash
# Run all tests
pnpm run test

# Run unit tests only
pnpm run test:unit

# Run integration tests only
pnpm run test:integration

# Run E2E tests
pnpm run test:e2e

# Watch mode (TDD workflow)
pnpm run test:watch

# Run tests for specific package
pnpm --filter @intelliflow/domain test

# Run specific test file
pnpm run test packages/domain/src/crm/lead/__tests__/Lead.test.ts

# Run tests matching pattern
pnpm run test -- --grep "LeadScore"
```

### Test Setup

Create test setup files for shared configuration:

```typescript
// apps/api/src/test/setup.ts
import { PrismaClient } from '@intelliflow/db';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';

export const createTestContext = async () => {
  const prisma = mockDeep<PrismaClient>();

  return {
    prisma,
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
    },
  };
};

// Reset mocks between tests
beforeEach(() => {
  mockReset(prisma);
});
```

### Mocking Best Practices

```typescript
// Good: Mock at the boundary
const mockRepository = {
  save: vi.fn(),
  findById: vi.fn(),
};

// Bad: Mock internal implementation details
const mockPrisma = {
  lead: {
    create: vi.fn(),
    findUnique: vi.fn(),
  },
};
```

### Test Isolation

Each test should be independent and not rely on state from other tests:

```typescript
describe('LeadRepository', () => {
  let repository: PrismaLeadRepository;
  let prisma: PrismaClient;

  beforeEach(async () => {
    // Fresh database state for each test
    prisma = new PrismaClient();
    await prisma.$executeRaw`TRUNCATE TABLE "Lead" CASCADE`;
    repository = new PrismaLeadRepository(prisma);
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  it('should save lead', async () => {
    // Test implementation
  });
});
```

## SOLID Principles for Refactoring

Apply these principles during the Refactor phase to improve code quality:

### Single Responsibility Principle (SRP)

**Definition**: A class should have only one reason to change.

**Bad Example:**

```typescript
class Lead {
  constructor(private data: LeadData) {}

  save(): void {
    // Database logic in domain model - violates SRP
    db.leads.insert(this.data);
  }

  sendEmail(): void {
    // Email logic in domain model - violates SRP
    emailService.send(this.data.email, 'Welcome');
  }
}
```

**Good Example:**

```typescript
// Domain model: Only business logic
class Lead extends AggregateRoot {
  constructor(
    private readonly id: LeadId,
    private name: string,
    private email: Email
  ) {
    super();
  }

  qualify(score: LeadScore): void {
    this.score = score;
    this.addDomainEvent(new LeadQualifiedEvent(this.id, score));
  }
}

// Repository: Persistence logic
class PrismaLeadRepository implements LeadRepository {
  async save(lead: Lead): Promise<void> {
    await this.prisma.lead.create({ data: lead.toData() });
  }
}

// Email service: Communication logic
class EmailService {
  async sendWelcomeEmail(lead: Lead): Promise<void> {
    await this.mailer.send(lead.email, 'Welcome');
  }
}
```

### Open/Closed Principle (OCP)

**Definition**: Open for extension, closed for modification.

**Bad Example:**

```typescript
class LeadScorer {
  score(lead: Lead): number {
    if (lead.source === 'WEBSITE') {
      return 50;
    } else if (lead.source === 'REFERRAL') {
      return 80;
    } else if (lead.source === 'CONFERENCE') {
      return 70;
    }
    return 0;
  }
}
```

**Good Example:**

```typescript
// Strategy pattern: Extensible without modification
interface ScoringStrategy {
  score(lead: Lead): number;
}

class WebsiteScoringStrategy implements ScoringStrategy {
  score(lead: Lead): number {
    return 50;
  }
}

class ReferralScoringStrategy implements ScoringStrategy {
  score(lead: Lead): number {
    return 80;
  }
}

class LeadScorer {
  constructor(private strategies: Map<LeadSource, ScoringStrategy>) {}

  score(lead: Lead): number {
    const strategy = this.strategies.get(lead.source);
    return strategy ? strategy.score(lead) : 0;
  }
}
```

### Liskov Substitution Principle (LSP)

**Definition**: Subtypes must be substitutable for their base types.

**Bad Example:**

```typescript
class Rectangle {
  constructor(
    protected width: number,
    protected height: number
  ) {}

  setWidth(width: number): void {
    this.width = width;
  }

  setHeight(height: number): void {
    this.height = height;
  }
}

class Square extends Rectangle {
  setWidth(width: number): void {
    this.width = width;
    this.height = width; // Violates LSP: Changes behavior
  }

  setHeight(height: number): void {
    this.width = height; // Violates LSP: Changes behavior
    this.height = height;
  }
}
```

**Good Example:**

```typescript
interface Shape {
  area(): number;
}

class Rectangle implements Shape {
  constructor(
    private width: number,
    private height: number
  ) {}

  area(): number {
    return this.width * this.height;
  }
}

class Square implements Shape {
  constructor(private side: number) {}

  area(): number {
    return this.side * this.side;
  }
}
```

### Interface Segregation Principle (ISP)

**Definition**: Clients should not depend on interfaces they don't use.

**Bad Example:**

```typescript
interface LeadRepository {
  save(lead: Lead): Promise<void>;
  findById(id: LeadId): Promise<Lead | null>;
  findAll(): Promise<Lead[]>;
  delete(id: LeadId): Promise<void>;
  archive(id: LeadId): Promise<void>;
  restore(id: LeadId): Promise<void>;
  export(): Promise<Buffer>; // Not all clients need export
  import(data: Buffer): Promise<void>; // Not all clients need import
}
```

**Good Example:**

```typescript
// Split into focused interfaces
interface LeadReader {
  findById(id: LeadId): Promise<Lead | null>;
  findAll(): Promise<Lead[]>;
}

interface LeadWriter {
  save(lead: Lead): Promise<void>;
  delete(id: LeadId): Promise<void>;
}

interface LeadArchiver {
  archive(id: LeadId): Promise<void>;
  restore(id: LeadId): Promise<void>;
}

interface LeadExporter {
  export(): Promise<Buffer>;
  import(data: Buffer): Promise<void>;
}

// Clients depend only on what they need
class QualifyLeadUseCase {
  constructor(
    private leadReader: LeadReader,
    private leadWriter: LeadWriter
  ) {}
}
```

### Dependency Inversion Principle (DIP)

**Definition**: Depend on abstractions, not concretions.

**Bad Example:**

```typescript
class CreateLeadUseCase {
  // Depends on concrete implementation
  private repository = new PrismaLeadRepository();

  async execute(input: CreateLeadInput): Promise<Lead> {
    const lead = Lead.create(input);
    await this.repository.save(lead);
    return lead;
  }
}
```

**Good Example:**

```typescript
// Depend on abstraction (port)
interface LeadRepository {
  save(lead: Lead): Promise<void>;
  findById(id: LeadId): Promise<Lead | null>;
}

class CreateLeadUseCase {
  constructor(private repository: LeadRepository) {} // Inject abstraction

  async execute(input: CreateLeadInput): Promise<Lead> {
    const lead = Lead.create(input);
    await this.repository.save(lead);
    return lead;
  }
}

// Adapter implements abstraction
class PrismaLeadRepository implements LeadRepository {
  async save(lead: Lead): Promise<void> {
    // Implementation
  }

  async findById(id: LeadId): Promise<Lead | null> {
    // Implementation
  }
}
```

## Testing Anti-Patterns to Avoid

### 1. Testing Implementation Details

**Bad:**

```typescript
it('should call internal method', () => {
  const lead = Lead.create({ name: 'Test' });
  const spy = vi.spyOn(lead as any, 'validateName');
  lead.updateName('New Name');
  expect(spy).toHaveBeenCalled();
});
```

**Good:**

```typescript
it('should update lead name', () => {
  const lead = Lead.create({ name: 'Test' });
  lead.updateName('New Name');
  expect(lead.getName()).toBe('New Name');
});
```

### 2. Excessive Mocking

**Bad:**

```typescript
it('should qualify lead', () => {
  const mockLead = { qualify: vi.fn() };
  const mockScore = { getValue: () => 80 };
  mockLead.qualify(mockScore);
  expect(mockLead.qualify).toHaveBeenCalledWith(mockScore);
});
```

**Good:**

```typescript
it('should qualify lead with high score', () => {
  const lead = Lead.create({ name: 'Test', email: 'test@example.com' });
  const score = LeadScore.create(80);
  lead.qualify(score);
  expect(lead.getStatus()).toBe(LeadStatus.QUALIFIED);
});
```

### 3. Test Interdependence

**Bad:**

```typescript
let savedLead: Lead;

it('should create lead', () => {
  savedLead = await repository.save(lead);
});

it('should find created lead', () => {
  const found = await repository.findById(savedLead.id); // Depends on previous test
  expect(found).toBeDefined();
});
```

**Good:**

```typescript
it('should create lead', async () => {
  const lead = Lead.create({ name: 'Test', email: 'test@example.com' });
  await repository.save(lead);
  expect(lead.id).toBeDefined();
});

it('should find lead by id', async () => {
  const lead = Lead.create({ name: 'Test', email: 'test@example.com' });
  await repository.save(lead);

  const found = await repository.findById(lead.id);
  expect(found).toBeDefined();
  expect(found?.getName()).toBe('Test');
});
```

## Additional Resources

- **Vitest Documentation**: https://vitest.dev/
- **Playwright Documentation**: https://playwright.dev/
- **Testing Library**: https://testing-library.com/
- **Kent C. Dodds - Testing Best Practices**:
  https://kentcdodds.com/blog/common-mistakes-with-react-testing-library
- **Martin Fowler - Test Pyramid**:
  https://martinfowler.com/bliki/TestPyramid.html

## Getting Help

- Check existing tests in `packages/domain/src/**/__tests__/` for examples
- Review the PR Review Checklist (`docs/shared/review-checklist.md`)
- Ask in the team chat for clarification on testing standards
- Reference CLAUDE.md for project-specific testing guidelines
