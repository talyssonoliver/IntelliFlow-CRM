# IntelliFlow CRM

Modern, AI-Native CRM platform built with **Hexagonal Architecture (Ports &
Adapters)** and **Domain-Driven Design (DDD)** principles. Designed for high
maintainability, type safety, and intelligent automation.

## Core Intent

IntelliFlow CRM is not just a lead management tool, but a modular ecosystem
where core business logic is isolated from infrastructure. This architecture
ensures that AI models, databases, and external integrations can be evolved or
swapped without impacting the central domain.

## Project Structure

The codebase is organized as a **Turborepo monorepo** following strict
architectural boundaries:

```
intelliFlow-CRM/
├── apps/                      # Composition Root (wires layers together)
│   ├── web/                   # Next.js 16+ Frontend (App Router)
│   ├── api/                   # tRPC API Server
│   ├── ai-worker/             # AI processing workers (LangChain/CrewAI)
│   ├── workers/               # Background job workers (Notifications, Events)
│   └── project-tracker/       # Internal sprint tracking dashboard
├── packages/                  # Shared Modular Packages
│   ├── domain/                # Pure Business Logic (Entities, Value Objects, Events)
│   ├── application/           # Use Cases & Ports (Input/Output Interfaces)
│   ├── adapters/              # Infrastructure (Prisma, Redis, AI Services, APIs)
│   ├── db/                    # Database Schema (Prisma + Supabase)
│   ├── validators/            # Type-safe Zod schemas
│   ├── ui/                    # Shared shadcn/ui components
│   └── platform/              # Feature flags & resilience patterns
├── docs/                      # Architecture ADRs & System Design
├── tests/                     # Unit, Integration, E2E, and Architecture tests
└── artifacts/                 # Governance evidence & validation reports
```

## Tech Stack

- **Frontend**: Next.js 16+ (App Router), React 19, shadcn/ui, Tailwind CSS
- **Backend**: tRPC, Node.js (Hexagonal Application Layer)
- **Database**: Prisma ORM, Supabase (PostgreSQL + pgvector for embeddings)
- **AI/ML**: LangChain, CrewAI, Ollama (Local), OpenAI (Production)
- **Observability**: OpenTelemetry, Prometheus, Grafana
- **Infrastructure**: Turborepo, pnpm, Docker, GitHub Actions

## Development Status

The project is currently in **Active Development (Sprint 17+)**. Overall
Progress: **~65% Completion** across 570+ tasks.

For real-time metrics and detailed sprint status, see
`docs/CURRENT_STATE_REPORT.md` or run the internal tracker:

```bash
pnpm tracker
```

## Quick Start

```bash
pnpm install
pnpm dev
pnpm test
```

For a full validation of the current architectural state:

```bash
pnpm run test:architecture
pnpm run validate:sprint
```

## Documentation

- `docs/architecture/overview.md` - Core System Design
- `docs/architecture/hex-boundaries.md` - Architectural Enforcement Rules
- `QUICK-START.md` - Comprehensive Developer Onboarding
- `SETUP.md` - Environment and Infrastructure Setup

## License

Proprietary - IntelliFlow CRM © 2025-2026
