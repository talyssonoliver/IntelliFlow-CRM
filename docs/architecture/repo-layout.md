# Repository Layout Documentation

**Version:** 1.0.0 **Last Updated:** 2025-12-14 **Maintainers:** DevOps Team,
Architecture Team

## Overview

IntelliFlow CRM follows a **monorepo architecture** using Turborepo and pnpm
workspaces. This document provides a comprehensive guide to the repository
structure, directory conventions, and organizational principles.

## Directory Structure

```
intelliFlow-CRM/
├── .github/                    # GitHub-specific configurations
│   ├── workflows/              # CI/CD GitHub Actions
│   ├── ISSUE_TEMPLATE/         # Issue templates
│   ├── PULL_REQUEST_TEMPLATE/ # PR templates
│   └── copilot-instructions.md # GitHub Copilot context
│
├── .claude/                    # Claude AI assistant configurations
│   └── commands/               # Custom Claude commands
│
├── apps/                       # Application workspaces
│   ├── web/                    # Next.js frontend application
│   │   ├── src/
│   │   │   ├── app/           # Next.js App Router pages
│   │   │   ├── components/    # React components
│   │   │   ├── lib/           # Utility libraries
│   │   │   └── styles/        # Global styles
│   │   ├── public/            # Static assets
│   │   ├── tests/             # App-specific tests
│   │   └── package.json
│   │
│   ├── api/                    # tRPC API server
│   │   ├── src/
│   │   │   ├── modules/       # Feature modules
│   │   │   ├── middleware/    # Express/tRPC middleware
│   │   │   ├── trpc/          # tRPC configuration
│   │   │   └── server.ts      # Server entry point
│   │   └── package.json
│   │
│   └── ai-worker/              # AI processing worker
│       ├── src/
│       │   ├── agents/        # CrewAI agents
│       │   ├── chains/        # LangChain chains
│       │   ├── tools/         # AI tools
│       │   └── worker.ts      # Worker entry point
│       └── package.json
│
├── packages/                   # Shared packages
│   ├── db/                     # Prisma database client
│   │   ├── prisma/
│   │   │   ├── schema.prisma  # Database schema
│   │   │   └── migrations/    # Migration files
│   │   └── src/
│   │
│   ├── domain/                 # Domain models (DDD)
│   │   ├── src/
│   │   │   ├── entities/      # Domain entities
│   │   │   ├── value-objects/ # Value objects
│   │   │   ├── events/        # Domain events
│   │   │   └── repositories/  # Repository interfaces
│   │   └── tests/
│   │
│   ├── validators/             # Zod validation schemas
│   │   └── src/
│   │       ├── lead/          # Lead validation schemas
│   │       ├── contact/       # Contact validation schemas
│   │       └── common/        # Shared schemas
│   │
│   ├── api-client/             # Generated tRPC client
│   │   └── src/
│   │
│   └── ui/                     # Shared UI components (shadcn/ui)
│       ├── src/
│       │   └── components/    # Reusable components
│       └── package.json
│
├── infra/                      # Infrastructure configurations
│   ├── docker/                 # Docker configurations
│   │   ├── Dockerfile.api
│   │   ├── Dockerfile.web
│   │   ├── Dockerfile.ai-worker
│   │   └── docker-compose.yml
│   │
│   ├── supabase/               # Supabase configurations
│   │   ├── migrations/        # Supabase migrations
│   │   └── config.toml        # Supabase config
│   │
│   ├── kubernetes/             # Kubernetes manifests
│   │   ├── base/              # Base configurations
│   │   └── overlays/          # Environment overlays
│   │
│   └── monitoring/             # Observability configs
│       ├── prometheus/
│       ├── grafana/
│       └── otel/              # OpenTelemetry
│
├── docs/                       # Documentation
│   ├── architecture/           # Architecture documentation
│   │   ├── ADR/               # Architecture Decision Records
│   │   ├── diagrams/          # Architecture diagrams
│   │   └── patterns/          # Design patterns
│   │
│   ├── api/                    # API documentation
│   │   └── openapi/           # OpenAPI specs
│   │
│   ├── guides/                 # Developer guides
│   │   ├── getting-started.md
│   │   ├── development.md
│   │   └── deployment.md
│   │
│   └── planning/               # Planning documents
│       ├── sprints/           # Sprint plans
│       ├── roadmap.md
│       └── DDD-context-map.puml
│
├── artifacts/                  # Build artifacts and outputs
│   ├── logs/                   # Log files
│   │   ├── build/             # Build logs
│   │   ├── test/              # Test logs
│   │   └── deployment/        # Deployment logs
│   │
│   ├── reports/                # Generated reports
│   │   ├── coverage/          # Test coverage reports
│   │   ├── bundle/            # Bundle analysis
│   │   └── performance/       # Performance reports
│   │
│   ├── metrics/                # Metrics data
│   │   ├── dora/              # DORA metrics
│   │   └── ai/                # AI performance metrics
│   │
│   └── misc/                   # Miscellaneous artifacts
│       ├── schemas/           # Generated schemas
│       └── configs/           # Generated configs
│
├── tests/                      # Shared test utilities
│   ├── fixtures/               # Test fixtures
│   ├── helpers/                # Test helpers
│   └── setup/                  # Test setup files
│
├── tools/                      # Development tools
│   ├── scripts/                # Build and utility scripts
│   ├── generators/             # Code generators
│   └── lint/                   # Custom linters
│
├── scripts/                    # Root-level scripts
│   ├── setup/                  # Environment setup scripts
│   ├── migration/              # Migration scripts
│   └── ci/                     # CI helper scripts
│
├── .gitignore                  # Git ignore patterns
├── .env.example                # Environment variables template
├── package.json                # Root package.json
├── pnpm-workspace.yaml         # pnpm workspace configuration
├── turbo.json                  # Turborepo configuration
├── tsconfig.json               # Root TypeScript config
├── CLAUDE.md                   # Claude AI assistant instructions
├── README.md                   # Project README
└── Sprint_plan.csv             # Sprint planning data
```

## Directory Conventions

### Application Directories (`apps/`)

**Purpose:** Contains independently deployable applications.

**Conventions:**

- Each app is a self-contained workspace
- Must have its own `package.json` with dependencies
- Should use shared packages from `packages/` directory
- Tests should be co-located in `tests/` subdirectory
- Configuration files (`.env.local`, etc.) never committed

**Naming:**

- Use lowercase with hyphens: `ai-worker`, `web`, `api`
- Descriptive names indicating purpose

### Package Directories (`packages/`)

**Purpose:** Contains shared libraries and utilities used across applications.

**Conventions:**

- Each package is a workspace that can be imported by apps
- Must export clear public API via `index.ts`
- Should be framework-agnostic when possible
- Follow single responsibility principle
- Include comprehensive tests with >90% coverage

**Types of Packages:**

- **Domain:** Pure business logic (no external dependencies)
- **Infrastructure:** External integrations (database, APIs)
- **UI:** Reusable UI components
- **Utilities:** Helper functions and utilities

### Infrastructure Directories (`infra/`)

**Purpose:** Infrastructure-as-Code and deployment configurations.

**Conventions:**

- Docker configurations for local development
- Kubernetes manifests for production deployment
- Environment-specific configurations in subdirectories
- Never include secrets or credentials
- Document all required environment variables

### Documentation Directories (`docs/`)

**Purpose:** Comprehensive project documentation.

**Conventions:**

- Use Markdown format for all documentation
- Include diagrams in `diagrams/` subdirectory
- Keep Architecture Decision Records (ADRs) in `architecture/ADR/`
- Update documentation with code changes
- Use clear naming: `feature-name.md`

### Artifacts Directories (`artifacts/`)

**Purpose:** Build outputs, logs, reports, and generated files.

**Conventions:**

- **Never commit to version control** (in `.gitignore`)
- Organized by type: `logs/`, `reports/`, `metrics/`
- Include timestamps in generated files
- Automated cleanup of old artifacts
- CI/CD writes here for analysis

**Subdirectory Structure:**

```
artifacts/
├── logs/           # All log files
├── reports/        # Generated reports (coverage, bundle, etc.)
├── metrics/        # Performance and business metrics
└── misc/           # Other generated artifacts
```

### Test Directories (`tests/`)

**Purpose:** Shared test utilities and fixtures.

**Conventions:**

- Application-specific tests live in `apps/*/tests/`
- Package-specific tests live in `packages/*/tests/`
- Shared test utilities here at root level
- Use descriptive names: `*.test.ts`, `*.spec.ts`
- Include integration and E2E tests

### Tools Directories (`tools/`)

**Purpose:** Development tools, scripts, and generators.

**Conventions:**

- Organized by purpose: `scripts/`, `generators/`, `lint/`
- Must be executable via `pnpm` scripts
- Include help documentation
- TypeScript-based when possible
- Versioned with the repository

## File Naming Conventions

### TypeScript/JavaScript Files

- **Components:** PascalCase - `LeadCard.tsx`, `ContactForm.tsx`
- **Utilities:** camelCase - `formatDate.ts`, `validateEmail.ts`
- **Tests:** Same name as file + `.test` or `.spec` - `LeadCard.test.tsx`
- **Config:** lowercase-with-hyphens - `next.config.js`, `tsconfig.json`
- **Types:** PascalCase + `.types.ts` - `Lead.types.ts`
- **Constants:** UPPER_SNAKE_CASE file - `API_CONSTANTS.ts`

### Configuration Files

- Root-level configs use standard names: `package.json`, `.gitignore`
- Environment files: `.env.example`, `.env.local` (never commit actual `.env`)
- Tool configs: `eslint.config.js`, `prettier.config.js`

### Documentation Files

- Use lowercase with hyphens: `getting-started.md`
- Architecture Decision Records: `ADR-001-title.md`
- Include dates in time-sensitive docs: `2025-12-sprint-planning.md`

## Workspace Configuration

### pnpm Workspaces

Workspaces are defined in `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'tools/*'
```

### Package Dependencies

Internal dependencies use workspace protocol:

```json
{
  "dependencies": {
    "@intelliflow/domain": "workspace:*",
    "@intelliflow/db": "workspace:*"
  }
}
```

### Turborepo Configuration

Build pipeline defined in `turbo.json`:

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "test": {
      "dependsOn": ["build"]
    }
  }
}
```

## Import Path Conventions

### Absolute Imports

Use TypeScript path aliases for cleaner imports:

```typescript
// ✅ Good
import { Lead } from '@/domain/entities/Lead';
import { LeadRepository } from '@/repositories/LeadRepository';

// ❌ Bad
import { Lead } from '../../../domain/entities/Lead';
```

### Package Imports

Use package names with `@intelliflow/` scope:

```typescript
// ✅ Good
import { db } from '@intelliflow/db';
import { LeadSchema } from '@intelliflow/validators';

// ❌ Bad
import { db } from '../../packages/db';
```

## Git Ignore Patterns

Key patterns in `.gitignore`:

```
# Dependencies
node_modules/
.pnp.*

# Environment files
.env
.env.local
.env.*.local

# Build outputs
dist/
.next/
.turbo/

# Artifacts (all contents)
artifacts/

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
```

## Security Considerations

### Never Commit

- Secrets, API keys, passwords
- `.env` files with actual values
- Private certificates/keys
- Database dumps with real data
- Personal identifiable information (PII)

### Always Use

- `.env.example` with placeholder values
- Vault references for secrets
- Environment variable substitution
- `.gitignore` patterns for sensitive files

## Maintenance Guidelines

### Regular Cleanup

- Remove unused dependencies monthly
- Archive old artifacts quarterly
- Update documentation with code changes
- Review and update `.gitignore` as needed

### Version Control

- Keep directory structure stable
- Document structural changes in ADRs
- Communicate breaking changes to team
- Use semantic versioning for packages

## References

- [Turborepo Documentation](https://turbo.build/repo/docs)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Artifact Path Conventions](./artifact-conventions.md)
- [Domain-Driven Design Structure](../planning/DDD-context-map.puml)

## Change Log

| Date       | Version | Changes                                 | Author      |
| ---------- | ------- | --------------------------------------- | ----------- |
| 2025-12-14 | 1.0.0   | Initial repository layout documentation | DevOps Team |
