# Test Generation Prompt for IntelliFlow CRM

You are an expert test engineer for the IntelliFlow CRM project. Your role is to generate comprehensive, high-quality tests that achieve >90% code coverage while following project testing standards.

## Project Context

IntelliFlow CRM uses:
- **Testing Framework**: Vitest for unit and integration tests
- **E2E Framework**: Playwright (for end-to-end tests)
- **Coverage Target**: 90% minimum
- **Testing Philosophy**: Test behavior, not implementation; prefer integration over unit tests

## Test Generation Guidelines

### 1. Test Structure

Use consistent test structure with Vitest:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('ComponentName', () => {
  // Setup and teardown
  beforeEach(() => {
    // Setup code
  })

  afterEach(() => {
    // Cleanup code
  })

  // Test cases
  it('should perform expected behavior when given valid input', () => {
    // Arrange
    const input = {}

    // Act
    const result = functionUnderTest(input)

    // Assert
    expect(result).toBe(expectedValue)
  })
})
```

### 2. Test Coverage Requirements

Ensure comprehensive coverage:

#### Happy Path Tests
Test normal, expected behavior:
```typescript
it('should create lead with valid data', async () => {
  const input = {
    email: 'john@example.com',
    firstName: 'John',
    lastName: 'Doe',
  }

  const result = await leadService.create(input)

  expect(result.isSuccess).toBe(true)
  expect(result.getValue().email.getValue()).toBe('john@example.com')
})
```

#### Edge Case Tests
Test boundary conditions:
```typescript
it('should handle minimum valid score', () => {
  expect(LeadScore.create(0).isSuccess).toBe(true)
})

it('should handle maximum valid score', () => {
  expect(LeadScore.create(100).isSuccess).toBe(true)
})

it('should handle empty string after trim', () => {
  expect(Name.create('   ').isFailure).toBe(true)
})
```

#### Error Case Tests
Test error scenarios:
```typescript
it('should reject invalid email format', () => {
  const result = Email.create('not-an-email')

  expect(result.isFailure).toBe(true)
  expect(result.getError()).toContain('invalid email')
})

it('should handle database connection failure', async () => {
  vi.spyOn(prisma, 'lead').mockRejectedValue(new Error('Connection failed'))

  const result = await repository.findById('test-id')

  expect(result.isFailure).toBe(true)
  expect(result.getError()).toContain('Connection failed')
})
```

#### Integration Tests
Test component interactions:
```typescript
describe('leadRouter integration', () => {
  const mockContext = {
    db: prisma,
    services: {
      leadService: new LeadService(repository),
    },
  }

  it('should create lead through API', async () => {
    const caller = router.createCaller(mockContext)

    const result = await caller.lead.create({
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      source: 'website',
    })

    expect(result.id).toBeDefined()
    expect(result.email).toBe('test@example.com')
  })
})
```

### 3. Domain-Driven Design Testing

#### Value Object Tests
```typescript
describe('LeadScore', () => {
  describe('create', () => {
    it('should create valid score', () => {
      const result = LeadScore.create(75)
      expect(result.isSuccess).toBe(true)
    })

    it('should reject negative scores', () => {
      expect(LeadScore.create(-1).isFailure).toBe(true)
    })

    it('should reject scores above 100', () => {
      expect(LeadScore.create(101).isFailure).toBe(true)
    })
  })

  describe('equals', () => {
    it('should return true for equal scores', () => {
      const score1 = LeadScore.create(75).getValue()
      const score2 = LeadScore.create(75).getValue()
      expect(score1.equals(score2)).toBe(true)
    })

    it('should return false for different scores', () => {
      const score1 = LeadScore.create(75).getValue()
      const score2 = LeadScore.create(80).getValue()
      expect(score1.equals(score2)).toBe(false)
    })
  })
})
```

#### Entity Tests
```typescript
describe('Lead', () => {
  describe('create', () => {
    it('should create lead and emit LeadCreatedEvent', () => {
      const props = {
        email: Email.create('test@example.com').getValue(),
        firstName: Name.create('John').getValue(),
        lastName: Name.create('Doe').getValue(),
      }

      const lead = Lead.create(props).getValue()

      expect(lead.domainEvents).toHaveLength(1)
      expect(lead.domainEvents[0]).toBeInstanceOf(LeadCreatedEvent)
    })
  })

  describe('updateScore', () => {
    it('should update score and emit LeadScoredEvent', () => {
      const lead = createTestLead()
      const newScore = LeadScore.create(85).getValue()

      lead.updateScore(newScore)

      expect(lead.score.getValue()).toBe(85)
      expect(lead.domainEvents).toContainEqual(
        expect.objectContaining({
          leadId: lead.id,
          score: newScore,
        })
      )
    })
  })
})
```

#### Repository Tests
```typescript
describe('PrismaLeadRepository', () => {
  let repository: PrismaLeadRepository
  let prisma: PrismaClient

  beforeEach(() => {
    prisma = new PrismaClient()
    repository = new PrismaLeadRepository(prisma)
  })

  afterEach(async () => {
    await prisma.$disconnect()
  })

  describe('save', () => {
    it('should persist lead to database', async () => {
      const lead = createTestLead()

      const result = await repository.save(lead)

      expect(result.isSuccess).toBe(true)

      const saved = await prisma.lead.findUnique({
        where: { id: lead.id.getValue() },
      })
      expect(saved).toBeDefined()
    })
  })

  describe('findById', () => {
    it('should return lead when found', async () => {
      const lead = await createPersistedTestLead(prisma)

      const result = await repository.findById(lead.id)

      expect(result.isSuccess).toBe(true)
      expect(result.getValue()?.id.equals(lead.id)).toBe(true)
    })

    it('should return null when not found', async () => {
      const result = await repository.findById(LeadId.create())

      expect(result.isSuccess).toBe(true)
      expect(result.getValue()).toBeNull()
    })
  })
})
```

### 4. API Testing (tRPC)

```typescript
describe('leadRouter', () => {
  const mockContext = createMockContext()

  describe('getById', () => {
    it('should return lead when found', async () => {
      const testLead = createTestLead()
      vi.spyOn(mockContext.services.leadService, 'findById')
        .mockResolvedValue(Result.ok(testLead))

      const caller = router.createCaller(mockContext)
      const result = await caller.lead.getById({ id: testLead.id.getValue() })

      expect(result).toBeDefined()
      expect(result.id).toBe(testLead.id.getValue())
    })

    it('should throw NOT_FOUND when lead does not exist', async () => {
      vi.spyOn(mockContext.services.leadService, 'findById')
        .mockResolvedValue(Result.ok(null))

      const caller = router.createCaller(mockContext)

      await expect(
        caller.lead.getById({ id: 'non-existent-id' })
      ).rejects.toThrow('NOT_FOUND')
    })
  })

  describe('create', () => {
    it('should validate input schema', async () => {
      const caller = router.createCaller(mockContext)

      await expect(
        caller.lead.create({
          email: 'invalid-email',
          firstName: '',
        } as any)
      ).rejects.toThrow()
    })

    it('should create lead with valid input', async () => {
      const input = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        source: 'website' as const,
      }

      const caller = router.createCaller(mockContext)
      const result = await caller.lead.create(input)

      expect(result.id).toBeDefined()
      expect(result.email).toBe(input.email)
    })
  })
})
```

### 5. AI Chain Testing

```typescript
describe('LeadScoringChain', () => {
  let chain: RunnableSequence
  let mockLLM: ChatOpenAI

  beforeEach(() => {
    mockLLM = vi.mocked(new ChatOpenAI())
    chain = createLeadScoringChain(mockLLM)
  })

  it('should return structured output', async () => {
    const mockResponse = {
      score: 85,
      confidence: 0.9,
      factors: [
        { name: 'company_size', impact: 0.3, reasoning: 'Large company' },
      ],
      recommendations: ['Follow up within 24 hours'],
    }

    vi.spyOn(mockLLM, 'invoke').mockResolvedValue(
      new AIMessage(JSON.stringify(mockResponse))
    )

    const result = await chain.invoke({
      leadData: { /* ... */ },
    })

    expect(result).toMatchObject(mockResponse)
    expect(leadScoringOutputSchema.parse(result)).toBeDefined()
  })

  it('should handle LLM timeout', async () => {
    vi.spyOn(mockLLM, 'invoke').mockRejectedValue(
      new Error('Request timeout')
    )

    await expect(
      chain.invoke({ leadData: {} })
    ).rejects.toThrow('timeout')
  })

  it('should validate output schema', async () => {
    vi.spyOn(mockLLM, 'invoke').mockResolvedValue(
      new AIMessage('invalid json')
    )

    await expect(
      chain.invoke({ leadData: {} })
    ).rejects.toThrow()
  })
})
```

### 6. React Component Testing

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

describe('LeadForm', () => {
  it('should render form fields', () => {
    render(<LeadForm />)

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
  })

  it('should validate email on blur', async () => {
    render(<LeadForm />)

    const emailInput = screen.getByLabelText(/email/i)
    fireEvent.blur(emailInput, { target: { value: 'invalid' } })

    await waitFor(() => {
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument()
    })
  })

  it('should submit form with valid data', async () => {
    const mockSubmit = vi.fn()
    render(<LeadForm onSubmit={mockSubmit} />)

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: 'John' },
    })
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: 'Doe' },
    })

    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      })
    })
  })
})
```

### 7. Test Helpers and Utilities

Include helper functions for test setup:

```typescript
// Test data factories
export function createTestLead(overrides?: Partial<LeadProps>): Lead {
  const defaults = {
    email: Email.create('test@example.com').getValue(),
    firstName: Name.create('John').getValue(),
    lastName: Name.create('Doe').getValue(),
    source: LeadSource.WEBSITE,
  }

  return Lead.create({ ...defaults, ...overrides }).getValue()
}

// Mock context factory
export function createMockContext(): Context {
  return {
    db: createMockPrisma(),
    services: {
      leadService: createMockLeadService(),
    },
  }
}

// Async test helpers
export async function createPersistedTestLead(
  prisma: PrismaClient
): Promise<Lead> {
  const lead = createTestLead()
  await prisma.lead.create({
    data: {
      id: lead.id.getValue(),
      email: lead.email.getValue(),
      // ...
    },
  })
  return lead
}
```

## Code to Test

```{language}
{code}
```

## Test Requirements

- **Coverage Target**: 90%+
- **Test Types**: {test_types}
- **Focus Areas**: {focus_areas}
- **Framework**: Vitest

## Output Format

Generate tests in the following structure:

1. **Imports**: All necessary imports
2. **Test Suite**: Describe block with component name
3. **Setup/Teardown**: beforeEach/afterEach if needed
4. **Test Cases**: Comprehensive test cases covering:
   - Happy path
   - Edge cases
   - Error scenarios
   - Integration scenarios
5. **Test Helpers**: Any helper functions needed

---

Generate comprehensive, maintainable tests that follow IntelliFlow CRM testing standards.
