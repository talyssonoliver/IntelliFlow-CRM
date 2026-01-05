# IntelliFlow CRM Developer Guide

This guide provides essential information for developers working on IntelliFlow CRM.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Project Structure](#project-structure)
3. [Package Dependency Map](#package-dependency-map)
4. [Development Workflow](#development-workflow)
5. [Architecture Patterns](#architecture-patterns)
6. [Testing Strategy](#testing-strategy)
7. [API Development](#api-development)
8. [Frontend Development](#frontend-development)
9. [AI Features](#ai-features)
10. [Security Guidelines](#security-guidelines)
11. [Deployment](#deployment)

---

## Getting Started

### Prerequisites

- **Node.js** 20.x or higher
- **pnpm** 8.x or higher (package manager)
- **Docker** and Docker Compose
- **Git** for version control

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/intelliflow/intelliflow-crm.git
cd intelliflow-crm

# Install dependencies
pnpm install

# Start Docker services (PostgreSQL, Redis)
docker-compose up -d

# Initialize database
pnpm run db:migrate
pnpm run db:seed

# Start development servers
pnpm run dev
```

### Environment Variables

Copy `.env.example` to `.env.local` and configure:

```env
DATABASE_URL="postgresql://..."
SUPABASE_URL="https://..."
SUPABASE_ANON_KEY="..."
OPENAI_API_KEY="sk-..."  # Optional for AI features
```

---

## Project Structure

```
intelliFlow-CRM/
├── apps/
│   ├── web/           # Next.js frontend (port 3000)
│   ├── api/           # tRPC API server (port 3001)
│   ├── ai-worker/     # AI processing worker
│   └── project-tracker/  # Sprint tracker dashboard
├── packages/
│   ├── domain/        # Domain entities and logic (DDD)
│   ├── application/   # Use cases and ports
│   ├── adapters/      # Infrastructure implementations
│   ├── validators/    # Zod validation schemas
│   ├── db/            # Prisma schema and client
│   └── ui/            # Shared UI components
├── docs/              # Documentation
├── infra/             # Infrastructure configs
└── tools/             # Build and maintenance scripts
```

---

## Package Dependency Map

The monorepo contains 22 packages, but only a subset is needed for daily development.

### Core Application Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                       APPLICATIONS                          │
├────────────────────────┬────────────────────────────────────┤
│   @intelliflow/web     │        @intelliflow/api            │
│    (Next.js app)       │         (tRPC server)              │
└────────────┬───────────┴──────────────┬─────────────────────┘
             │                          │
             ▼                          ▼
┌────────────────────────┬────────────────────────────────────┐
│   WEB DEPENDENCIES     │        API DEPENDENCIES            │
├────────────────────────┼────────────────────────────────────┤
│  • ui                  │  • adapters                        │
│  • api-client          │  • application                     │
│  • domain              │  • db                              │
│  • validators          │  • domain                          │
│  • api (types only)    │  • platform                        │
│                        │  • validators                      │
└────────────────────────┴────────────────────────────────────┘
```

### Packages Required for Development (9 packages)

| Package | Role |
|---------|------|
| `@intelliflow/web` | Next.js frontend application |
| `@intelliflow/api` | tRPC API server |
| `@intelliflow/domain` | Business logic, entities (shared) |
| `@intelliflow/validators` | Zod schemas (shared) |
| `@intelliflow/db` | Prisma client |
| `@intelliflow/adapters` | Repository implementations |
| `@intelliflow/application` | Use cases, services |
| `@intelliflow/platform` | Platform utilities |
| `@intelliflow/ui` | UI components |
| `@intelliflow/api-client` | tRPC client for frontend |

### Packages NOT Required for Daily Development

| Package | When to Run |
|---------|-------------|
| `@intelliflow/architecture-tests` | Pre-commit/CI only |
| `@intelliflow/plan-linter` | When editing Sprint_plan.csv |
| `@intelliflow/ai-worker` | Only if working on AI features |
| `@intelliflow/events-worker` | Only if working on events |
| `@intelliflow/ingestion-worker` | Only if working on ingestion |
| `@intelliflow/notifications-worker` | Only if working on notifications |
| `@intelliflow/observability` | Config only, rarely builds |
| `@intelliflow/sdk` | Only if building SDK |
| `@intelliflow/webhooks` | Only if working on webhooks |
| `@intelliflow/worker-shared` | Only if working on workers |
| `@intelliflow/workers` | Umbrella package for workers |
| `@intelliflow/typescript-config` | Config only, no build |

### Optimized Development Commands

```bash
# Default: runs only web + api + dependencies (~9 packages)
pnpm dev

# Run ALL packages (use sparingly, heavy on resources)
pnpm dev:all

# Run specific apps with their dependencies
pnpm --filter "@intelliflow/web..." dev      # Web + dependencies
pnpm --filter "@intelliflow/api..." dev      # API + dependencies
pnpm --filter "@intelliflow/ai-worker..." dev # AI worker + dependencies

# Typecheck only specific packages
pnpm --filter @intelliflow/web typecheck
pnpm --filter @intelliflow/domain typecheck
```

---

## Development Workflow

### Branch Naming

```
feat/IFC-XXX-brief-description   # New features
fix/IFC-XXX-brief-description    # Bug fixes
docs/IFC-XXX-brief-description   # Documentation
refactor/IFC-XXX-description     # Refactoring
test/IFC-XXX-description         # Test additions
```

### Commit Messages

We use conventional commits:

```
feat(lead): add AI scoring endpoint
fix(api): resolve tenant isolation issue
docs(adr): add ADR-012 for caching strategy
test(domain): add Lead entity unit tests
```

### Pull Request Process

1. Create feature branch from `main`
2. Implement changes with tests
3. Run quality checks: `pnpm run lint && pnpm run typecheck && pnpm run test`
4. Create PR with description following template
5. Address review feedback
6. Merge after approval

---

## Architecture Patterns

### Hexagonal Architecture

We follow hexagonal (ports & adapters) architecture:

```
Domain Layer (core business logic)
    ↓
Application Layer (use cases, ports)
    ↓
Adapters Layer (infrastructure)
```

**Key Rules:**
- Domain code has NO external dependencies
- Application layer defines ports (interfaces)
- Adapters implement ports

### Domain-Driven Design

Entities follow DDD principles:

```typescript
// packages/domain/src/crm/lead/Lead.ts
export class Lead extends AggregateRoot<LeadId> {
  private constructor(
    id: LeadId,
    private email: Email,
    private score: LeadScore,
    // ...
  ) {
    super(id);
  }

  static create(props: CreateLeadProps): Result<Lead> {
    // Factory method with validation
  }

  qualify(reason: string): void {
    // Business logic
    this.addDomainEvent(new LeadQualifiedEvent(this.id, reason));
  }
}
```

### Type-Safe API (tRPC)

All API endpoints use tRPC for end-to-end type safety:

```typescript
// apps/api/src/modules/lead/lead.router.ts
export const leadRouter = createTRPCRouter({
  create: tenantProcedure
    .input(createLeadSchema)
    .mutation(async ({ ctx, input }) => {
      // Implementation
    }),
});
```

---

## Testing Strategy

### Test Pyramid

| Layer | Coverage Target | Tools |
|-------|-----------------|-------|
| Domain | >95% | Vitest |
| Application | >90% | Vitest |
| API Routes | >85% | Vitest + supertest |
| E2E | Critical paths | Playwright |

### Running Tests

```bash
# All tests
pnpm run test

# Watch mode
pnpm run test:watch

# Coverage report
pnpm run test -- --coverage

# E2E tests
pnpm run test:e2e

# Specific package
pnpm --filter @intelliflow/domain test
```

### Test Structure

```typescript
// Example: packages/domain/src/crm/lead/__tests__/Lead.test.ts
describe('Lead', () => {
  describe('create', () => {
    it('should create a valid lead', () => {
      const result = Lead.create({...});
      expect(result.isSuccess).toBe(true);
    });

    it('should fail with invalid email', () => {
      const result = Lead.create({ email: 'invalid' });
      expect(result.isFailure).toBe(true);
    });
  });
});
```

---

## API Development

### Creating a New Endpoint

1. **Define Zod Schema** (`packages/validators/`)
2. **Create Router** (`apps/api/src/modules/`)
3. **Add to Main Router** (`apps/api/src/router.ts`)
4. **Write Tests** (`apps/api/src/__tests__/`)

### Router Template

```typescript
import { z } from 'zod';
import { createTRPCRouter, tenantProcedure } from '../../trpc';

export const myRouter = createTRPCRouter({
  list: tenantProcedure
    .input(z.object({ page: z.number().default(1) }))
    .query(async ({ ctx, input }) => {
      // Use ctx.prismaWithTenant for tenant-isolated queries
      return ctx.prismaWithTenant.myEntity.findMany({...});
    }),
});
```

### API Documentation

- OpenAPI spec: `apps/api/openapi.json`
- Postman collection: `artifacts/misc/postman-collection.json`

---

## Frontend Development

### Component Guidelines

- Use shadcn/ui components from `packages/ui/`
- Follow WCAG 2.1 AA accessibility standards
- Target Lighthouse score >90

### Page Structure

```typescript
// apps/web/src/app/[route]/page.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page Title | IntelliFlow CRM',
  description: 'SEO description',
};

export default function MyPage() {
  return (
    <main id="main-content">
      {/* Page content */}
    </main>
  );
}
```

### State Management

- Server state: React Query (via tRPC)
- Local state: React useState/useReducer
- Global state: Zustand (when needed)

---

## AI Features

### Lead Scoring

AI scoring is handled by the `ai-worker` service:

```typescript
// Using the API
const result = await trpc.lead.scoreWithAI.mutate({
  leadId: 'uuid',
});
// Returns: { score, confidence, tier, autoQualified }
```

### Human-in-the-Loop

All AI actions require approval before execution:

```typescript
// apps/api/src/modules/agent/agent.router.ts
// Pending approvals can be listed and approved/rejected
```

### Configuration

AI features require:
- `OPENAI_API_KEY` for production
- Ollama for local development (`ollama serve`)

---

## Security Guidelines

### Multi-Tenancy

- All data is tenant-isolated via RLS
- Use `tenantProcedure` for tenant-aware endpoints
- Never bypass tenant context

### Authentication

- Supabase Auth handles authentication
- JWT tokens with tenant ID claims
- Session tokens are HTTP-only cookies

### Input Validation

- All inputs validated with Zod
- Sanitize user content before rendering
- Use parameterized queries (Prisma handles this)

### Secrets

- Never commit secrets
- Use environment variables
- Rotate secrets regularly

---

## Deployment

### Environments

| Environment | Purpose | URL |
|-------------|---------|-----|
| Development | Local dev | localhost:3000 |
| Staging | Pre-production | staging.intelliflow-crm.com |
| Production | Live | app.intelliflow-crm.com |

### CI/CD Pipeline

1. **Lint & Typecheck** - Code quality
2. **Unit Tests** - Coverage checks
3. **Build** - Compile artifacts
4. **E2E Tests** - Critical path validation
5. **Deploy** - Railway/Vercel deployment

### Release Process

1. Merge to `main`
2. CI/CD pipeline runs
3. Staging deployment (automatic)
4. Manual promotion to production

---

## Useful Commands

```bash
# Development (optimized - only runs required packages)
pnpm dev                  # Web + API + dependencies (~9 packages)
pnpm dev:all              # ALL packages (use sparingly)
pnpm dev:web              # Web frontend only
pnpm dev:api              # API server only
pnpm dev:worker           # AI worker only

# Database
pnpm db:migrate           # Run migrations
pnpm db:studio            # Open Prisma Studio
pnpm db:seed              # Seed database

# Quality
pnpm lint                 # Run ESLint
pnpm lint:fix             # Auto-fix lint issues
pnpm typecheck            # TypeScript check (all packages)
pnpm format               # Format with Prettier

# Targeted typecheck (faster)
pnpm --filter @intelliflow/web typecheck
pnpm --filter @intelliflow/api typecheck

# Testing
pnpm test                 # Run all tests
pnpm test:e2e             # Run E2E tests
pnpm test:coverage        # Coverage report
```

---

## Resources

- [Architecture Decision Records](./shared/adr-index.md)
- [API Documentation](../apps/api/openapi.json)
- [UI Component Storybook](../packages/ui/)
- [Sprint Plan](../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)

---

*Last Updated: 2026-01-01*
*Version: 1.1.0*
