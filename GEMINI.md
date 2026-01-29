# IntelliFlow CRM - Gemini Context

## Project Overview
**IntelliFlow CRM** is an AI-native CRM platform built with a modern stack optimized for AI-first development. It emphasizes automation, type safety, and domain-driven design.

- **Status**: Currently in **Sprint 6** (MVP Phase).
- **Core Philosophy**: "AI-First" - AI is deeply integrated into the development lifecycle and the product itself.
- **Source of Truth**: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` drives all tasks, dependencies, and validation.

## Architecture & Tech Stack

### Monorepo Structure (Turborepo + pnpm)
*   **`apps/`**: Deployable applications.
    *   `web`: Next.js 16 (App Router) frontend + shadcn/ui.
    *   `api`: tRPC server.
    *   `ai-worker`: LangChain/CrewAI worker for background tasks.
    *   `project-tracker`: Next.js dashboard for tracking project metrics.
*   **`packages/`**: Shared libraries.
    *   `domain`: **Pure business logic** (DDD). No external dependencies allowed.
    *   `application`: Use cases and ports. Orchestrates domain logic.
    *   `adapters`: Infrastructure implementations (repositories, external APIs).
    *   `db`: Prisma ORM + Supabase client.
    *   `ui`: Shared React components (shadcn/ui).
    *   `api-client`: Type-safe tRPC client.

### Key Architectural Patterns
*   **Domain-Driven Design (DDD)**: Strict separation of concerns.
    *   **Domain Layer** (`packages/domain`): Entities, Value Objects, Domain Events. *Must remain pure.*
*   **Hexagonal Architecture**:
    *   Dependencies point **inward** (Adapters -> Application -> Domain).
    *   **Architecture Tests** (`tests/architecture`) enforce these boundaries in CI.
*   **Type Safety**: End-to-end safety via TypeScript, tRPC, Zod, and Prisma.

## Critical Development Rules

1.  **Sprint Plan is Law**: All work must be tied to a task in `Sprint_plan.csv`.
    *   **Read**: Use split files (`Sprint_plan_A.csv`, etc.) to save tokens.
    *   **Edit**: Only edit `Sprint_plan.csv`. Run sync after edits.
    *   **Verify**: Check KPIs, Artifacts, and Definition of Done for every task.
2.  **Artifacts**: You must produce the specific artifacts (files, reports) listed in the task definition.
    *   Locations: `artifacts/benchmarks`, `artifacts/coverage`, `artifacts/metrics`.
    *   **Do not** invent new artifact locations.
3.  **Strict Boundaries**:
    *   Never import infrastructure code (Prisma, external libs) into the `domain` package.
    *   Never commit secrets.
4.  **Testing**:
    *   **Domain**: >95% coverage required.
    *   **Overall**: >90% coverage enforced by CI.
    *   **Verification**: Always run `pnpm run test:architecture` after structural changes.

## Development Workflow

1.  **Select Task**: Find task in `Sprint_plan.csv`. Note dependencies and requirements.
2.  **Plan**: Check `Dependencies` and `Pre-requisites`.
3.  **Implement**:
    *   **Database**: Edit `packages/db/prisma/schema.prisma` -> `pnpm run db:migrate:create`.
    *   **Domain**: Add entities to `packages/domain`.
    *   **API**: Create tRPC router in `apps/api`.
    *   **UI**: specific UI tasks require checking `DESIGN:` prefixes for mockups.
4.  **Verify**:
    *   Run tests: `pnpm test`
    *   Lint: `pnpm run lint`
    *   Typecheck: `pnpm run typecheck`
5.  **Finalize**:
    *   Update `Sprint_plan.csv` status to "Completed".
    *   Generate task metric JSON in `apps/project-tracker/docs/metrics/`.
    *   Sync metrics: `pnpm run sync:metrics`.

## Common Commands

### Setup & Run
```bash
pnpm install             # Install dependencies
pnpm run setup:local     # Full local setup (db migrate + seed)
pnpm run dev             # Start all apps
pnpm run docker:up       # Start DB/Redis containers
```

### Database
```bash
pnpm run db:generate     # Generate Prisma client
pnpm run db:migrate      # Apply migrations
pnpm run db:studio       # View DB GUI
```

### Testing
```bash
pnpm test                # Run all tests
pnpm test:unit           # Unit tests
pnpm test:e2e            # Playwright E2E tests
pnpm test:architecture   # Verify dependency rules
```

### Quality & Governance
```bash
pnpm run lint            # Linting
pnpm run typecheck       # TypeScript check
pnpm run validate:sprint # Validate sprint progress against plan
```

## AI Configuration
*   **Local**: Uses Ollama (`AI_PROVIDER=ollama`).
*   **Production**: Uses OpenAI (`AI_PROVIDER=openai`).
*   **Agents**: Located in `apps/ai-worker/src/agents/`.

**Note for Gemini**: When asked to implement a feature, always cross-reference `Sprint_plan.csv` to ensure you are building exactly what is required and generating the necessary proof-of-work artifacts.