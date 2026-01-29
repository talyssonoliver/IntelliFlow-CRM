# IntelliFlow CRM

Modern CRM platform built with AI-first principles, leveraging Next.js, tRPC,
and intelligent automation.

## Quick Start

```bash
pnpm install
pnpm dev
pnpm test
pnpm run validate:sprint0
```

## Project Structure

```
intelliFlow-CRM/
├── apps/
│   ├── web/              # Next.js frontend
│   ├── api/              # tRPC API server
│   ├── ai-worker/        # AI processing workers
│   └── project-tracker/  # Sprint tracking dashboard
├── packages/
│   ├── db/               # Prisma + Supabase
│   ├── domain/           # Domain models (DDD)
│   ├── validators/       # Zod schemas
│   ├── api-client/       # tRPC client
│   ├── ui/               # Shared UI components
│   └── platform/         # Feature flags & platform utilities
├── docs/                 # Architecture & planning
├── tests/                # Unit / integration / E2E tests
├── tools/                # Scripts & utilities
└── artifacts/            # Sprint artifacts & evidence
```

## Tech Stack

- **Frontend**: Next.js (App Router), React, shadcn/ui, Tailwind CSS
- **Backend**: tRPC, Prisma, Supabase (PostgreSQL + pgvector)
- **AI/ML**: LangChain, model provider integrations (no keys committed)
- **Monorepo**: Turborepo, pnpm workspaces
- **Testing**: Vitest, Playwright
- **Observability**: OpenTelemetry
- **CI/CD**: GitHub Actions, Docker

## Sprint 0 Status

**Completion**: 100% (35/35 tasks)

- Completed: 35
- In Progress: 0
- Planned: 0
- Backlog: 0
- Blocked: 0

See `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` for details.

## Documentation

- `QUICK-START.md`
- `SETUP.md`
- `VALIDATION.md`
- `PLANNING_ANALYSIS.md`
- `CLAUDE.md`
- `docs/architecture/`
- Sprint 0 run report: `artifacts/sprint0/codex-run/report.md`

## Testing

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:coverage
```

## License

Proprietary - IntelliFlow CRM © 2025
