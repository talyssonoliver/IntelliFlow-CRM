# GitHub Copilot Instructions for IntelliFlow CRM

This document provides context and instructions for GitHub Copilot when working
with the IntelliFlow CRM codebase.

## Project Overview

IntelliFlow CRM is an AI-powered Customer Relationship Management system built
with a modern TypeScript stack. The project follows Domain-Driven Design (DDD)
principles and uses a monorepo structure managed by Turborepo.

### Technology Stack

- **Monorepo**: Turborepo with pnpm workspaces
- **Backend**: tRPC (type-safe APIs), Prisma ORM, PostgreSQL
- **Frontend**: Next.js 16 (App Router), React, Tailwind CSS, shadcn/ui
- **Database**: Supabase (PostgreSQL with pgvector)
- **AI/LLM**: LangChain, CrewAI, OpenAI API, Ollama
- **Testing**: Vitest (unit/integration), Playwright (E2E)
- **Infrastructure**: Docker Compose, Railway/Vercel

## Code Generation Guidelines

### Type Safety Requirements

All code must maintain end-to-end type safety:

```typescript
// ✅ GOOD: Type-safe tRPC procedure
export const leadRouter = t.router({
  getById: t.procedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      return ctx.db.lead.findUnique({ where: { id: input.id } });
    }),
});

// ❌ BAD: Any types or missing validation
export const leadRouter = t.router({
  getById: t.procedure.query(async ({ input }: any) => {
    return db.lead.findUnique({ where: { id: input.id } });
  }),
});
```

### Domain-Driven Design Patterns

#### Entities and Value Objects

```typescript
// Value Object - Immutable, validated business concept
export class LeadScore extends ValueObject {
  private constructor(private readonly value: number) {
    if (value < 0 || value > 100) {
      throw new InvalidLeadScoreError(value);
    }
  }

  static create(value: number): Result<LeadScore> {
    try {
      return Result.ok(new LeadScore(value));
    } catch (error) {
      return Result.fail(error.message);
    }
  }

  getValue(): number {
    return this.value;
  }

  equals(other: LeadScore): boolean {
    return this.value === other.value;
  }
}

// Entity - Has identity, mutable state
export class Lead extends AggregateRoot<LeadProps> {
  private constructor(props: LeadProps, id?: LeadId) {
    super(props, id);
  }

  static create(props: LeadProps, id?: LeadId): Result<Lead> {
    const lead = new Lead(props, id);
    if (!id) {
      lead.addDomainEvent(new LeadCreatedEvent(lead));
    }
    return Result.ok(lead);
  }

  updateScore(newScore: LeadScore): void {
    this.props.score = newScore;
    this.addDomainEvent(new LeadScoredEvent(this.id, newScore));
  }
}
```

#### Repository Pattern

```typescript
// Domain defines interface (in packages/domain/)
export interface LeadRepository {
  save(lead: Lead): Promise<Result<void>>;
  findById(id: LeadId): Promise<Result<Lead | null>>;
  findByEmail(email: Email): Promise<Result<Lead | null>>;
}

// Infrastructure implements (in packages/adapters/)
export class PrismaLeadRepository implements LeadRepository {
  constructor(private prisma: PrismaClient) {}

  async save(lead: Lead): Promise<Result<void>> {
    try {
      await this.prisma.lead.upsert({
        where: { id: lead.id.getValue() },
        create: this.toPrisma(lead),
        update: this.toPrisma(lead),
      });
      return Result.ok();
    } catch (error) {
      return Result.fail(error.message);
    }
  }

  private toPrisma(lead: Lead): PrismaLeadCreateInput {
    // Map domain model to Prisma model
  }
}
```

### Validation with Zod

Always validate inputs using Zod schemas:

```typescript
// Define schema in packages/validators/
export const createLeadSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  company: z.string().min(1).max(200).optional(),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/)
    .optional(),
  source: z.enum(['website', 'referral', 'event', 'cold_outreach']),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

// Use in tRPC router
export const leadRouter = t.router({
  create: t.procedure
    .input(createLeadSchema)
    .mutation(async ({ input, ctx }) => {
      // Input is fully typed and validated
      const result = await ctx.services.leadService.create(input);
      return result;
    }),
});
```

### Testing Standards

All code must include comprehensive tests with >90% coverage:

```typescript
// Unit test for domain logic
describe('LeadScore', () => {
  it('should create valid score', () => {
    const result = LeadScore.create(75);
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().getValue()).toBe(75);
  });

  it('should reject invalid scores', () => {
    expect(LeadScore.create(-1).isFailure).toBe(true);
    expect(LeadScore.create(101).isFailure).toBe(true);
  });
});

// Integration test for API
describe('leadRouter', () => {
  it('should create lead with valid data', async () => {
    const caller = router.createCaller(mockContext);
    const result = await caller.lead.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      source: 'website',
    });
    expect(result.id).toBeDefined();
  });
});
```

### AI Integration Patterns

When generating AI-related code:

```typescript
// Use structured outputs with Zod
export const leadScoringOutputSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  factors: z.array(
    z.object({
      name: z.string(),
      impact: z.number(),
      reasoning: z.string(),
    })
  ),
  recommendations: z.array(z.string()),
});

export type LeadScoringOutput = z.infer<typeof leadScoringOutputSchema>;

// LangChain chain with structured output
export const createLeadScoringChain = (llm: ChatOpenAI) => {
  const parser = StructuredOutputParser.fromZodSchema(leadScoringOutputSchema);

  const chain = RunnableSequence.from([
    PromptTemplate.fromTemplate(LEAD_SCORING_PROMPT),
    llm,
    parser,
  ]);

  return chain;
};

// Always include human-in-the-loop for critical decisions
export class LeadQualificationAgent {
  async qualify(lead: Lead): Promise<QualificationResult> {
    const aiResult = await this.aiScore(lead);

    // If confidence is low, require human review
    if (aiResult.confidence < 0.7) {
      return {
        status: 'pending_review',
        aiSuggestion: aiResult,
        requiresHumanApproval: true,
      };
    }

    return {
      status: 'auto_qualified',
      result: aiResult,
      requiresHumanApproval: false,
    };
  }
}
```

## Project Structure Conventions

### Monorepo Organization

```
intelliFlow-CRM/
├── apps/
│   ├── web/              # Next.js frontend (App Router)
│   ├── api/              # tRPC API server
│   └── ai-worker/        # AI processing worker
├── packages/
│   ├── db/               # Prisma schema and client
│   ├── domain/           # Domain models (pure business logic)
│   ├── validators/       # Zod validation schemas
│   ├── api-client/       # Generated tRPC client
│   └── ui/               # Shared UI components
```

### Import Conventions

```typescript
// Use workspace protocol in package.json
{
  "dependencies": {
    "@intelliflow/domain": "workspace:*",
    "@intelliflow/validators": "workspace:*"
  }
}

// Import from workspace packages
import { Lead, LeadScore } from '@intelliflow/domain'
import { createLeadSchema } from '@intelliflow/validators'
import { db } from '@intelliflow/db'
```

### File Naming Conventions

- **Components**: PascalCase (e.g., `LeadCard.tsx`)
- **Utilities**: camelCase (e.g., `formatDate.ts`)
- **Types**: PascalCase with `.types.ts` suffix (e.g., `Lead.types.ts`)
- **Tests**: Same name with `.test.ts` or `.spec.ts` suffix
- **Domain**: PascalCase for entities/VOs (e.g., `Lead.ts`, `LeadScore.ts`)

## Common Patterns

### Error Handling

Use Result pattern for domain operations:

```typescript
export class Result<T> {
  private constructor(
    private readonly _isSuccess: boolean,
    private readonly _value?: T,
    private readonly _error?: string
  ) {}

  static ok<U>(value?: U): Result<U> {
    return new Result<U>(true, value);
  }

  static fail<U>(error: string): Result<U> {
    return new Result<U>(false, undefined, error);
  }

  get isSuccess(): boolean {
    return this._isSuccess;
  }

  get isFailure(): boolean {
    return !this._isSuccess;
  }

  getValue(): T {
    if (!this._isSuccess) {
      throw new Error('Cannot get value from failed result');
    }
    return this._value!;
  }

  getError(): string {
    return this._error || '';
  }
}
```

### Domain Events

```typescript
export abstract class DomainEvent {
  public readonly occurredAt: Date;
  public readonly eventId: string;

  constructor() {
    this.occurredAt = new Date();
    this.eventId = crypto.randomUUID();
  }
}

export class LeadCreatedEvent extends DomainEvent {
  constructor(
    public readonly leadId: string,
    public readonly email: string,
    public readonly source: string
  ) {
    super();
  }
}

// Aggregate root collects events
export abstract class AggregateRoot<T> extends Entity<T> {
  private _domainEvents: DomainEvent[] = [];

  get domainEvents(): DomainEvent[] {
    return this._domainEvents;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  clearEvents(): void {
    this._domainEvents = [];
  }
}
```

### Next.js App Router Patterns

```typescript
// Server Component (default)
export default async function LeadsPage() {
  const leads = await db.lead.findMany()

  return (
    <div>
      <LeadList leads={leads} />
    </div>
  )
}

// Client Component (interactive)
'use client'

import { useState } from 'react'
import { api } from '@/trpc/client'

export function LeadForm() {
  const [formData, setFormData] = useState({})
  const createLead = api.lead.create.useMutation()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createLead.mutateAsync(formData)
  }

  return <form onSubmit={handleSubmit}>...</form>
}
```

## Security Best Practices

1. **Never commit secrets**: Use environment variables
2. **Validate all inputs**: Use Zod schemas before processing
3. **Sanitize AI outputs**: Never render AI-generated content without
   sanitization
4. **Use RLS**: Enable Row Level Security in Supabase
5. **Rate limiting**: Implement rate limiting on all public endpoints

## Performance Considerations

- **Database queries**: Use Prisma's select to fetch only needed fields
- **AI calls**: Implement caching and rate limiting
- **Next.js**: Use Server Components by default, Client Components only when
  needed
- **Build optimization**: Keep bundle size minimal, use dynamic imports

## Code Review Checklist

Before suggesting code, ensure:

- [ ] TypeScript strict mode passes with no errors
- [ ] All inputs are validated with Zod
- [ ] Tests are included with >90% coverage
- [ ] Domain logic is in domain layer, not infrastructure
- [ ] No secrets or sensitive data in code
- [ ] Follows DDD principles (if domain code)
- [ ] Uses repository pattern for data access
- [ ] Error handling uses Result pattern
- [ ] AI outputs have confidence scores
- [ ] Documentation is updated

## Resources

- Project README: `/Readme.md`
- Architecture docs: `/docs/architecture/`
- Sprint plan: `/Sprint_plan.csv`
- CLAUDE.md: `/CLAUDE.md` (full project guide)

## Common Gotchas

1. **Prisma Client**: Always run `pnpm run db:generate` after schema changes
2. **tRPC Context**: Context is recreated per request, don't store mutable state
3. **Next.js Caching**: Be careful with fetch caching in Server Components
4. **Zod Transforms**: Use `.transform()` carefully, can break type inference
5. **Domain Events**: Always publish events AFTER transaction commits
6. **Monorepo Imports**: Use `workspace:*` protocol in package.json

## Questions or Issues?

If you're unsure about a pattern or approach, refer to:

- Existing code in the same module for consistency
- Architecture Decision Records (ADRs) in `/docs/planning/adr/`
- The project CLAUDE.md for detailed guidelines
