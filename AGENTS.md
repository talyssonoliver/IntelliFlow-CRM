# AGENTS.md

**IntelliFlow CRM** — AI-powered CRM system. Sprint 6 (MVP phase). IFC-010
Go/No-Go passed 2025-12-27. 316 tasks across 34 sprints tracked in
`Sprint_plan.csv`.

## Task ID Conventions

- `EXC-*`: Exception/special tasks
- `AI-SETUP-*`: AI tooling configuration
- `ENV-*-AI`: Environment setup with AI automation
- `AUTOMATION-*`: AI agent coordination
- `IFC-*`: IntelliFlow Core features
- `PG-*`: Page/UI implementations

## Core Tech Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Backend**: tRPC, Prisma ORM, PostgreSQL
- **Frontend**: Next.js 16.0.10 (App Router), shadcn/ui, Tailwind CSS
- **Database**: Supabase (PostgreSQL + pgvector)
- **AI/LLM**: LangChain, CrewAI, OpenAI, Ollama (local dev)
- **Infra**: Docker Compose, Railway/Vercel
- **Testing**: Vitest, Playwright
- **Observability**: OpenTelemetry, Sentry

## Sprint Plan

**DO NOT read `Sprint_plan.csv` directly** — exceeds token limit. Use split
files:

```
apps/project-tracker/docs/metrics/_global/
├── Sprint_plan.csv      # Source of truth (edit here only)
├── Sprint_plan_A.csv    # Rows 1-79 (Sprint 0 early)
├── Sprint_plan_B.csv    # Rows 80-165 (Sprint 0-1)
├── Sprint_plan_C.csv    # Rows 166-249 (Sprint 1-3)
├── Sprint_plan_D.csv    # Rows 250-316 (Sprint 3-12)
└── Sprint_plan_E.csv    # Rows 317-353 (Sprint 12+)
```

Regenerate splits: `npx tsx tools/scripts/split-sprint-plan.ts` Full guide:
`docs/Codex-refs/sprint-plan-guide.md`

## Project Structure (Top Level)

```
apps/
  web/             # Next.js frontend
  api/             # tRPC API server
  ai-worker/       # AI processing (LangChain/CrewAI)
  project-tracker/ # Sprint tracker dashboard (http://localhost:3002/)
packages/
  db/              # Prisma schema & client
  domain/          # Domain models (DDD, zero infra deps)
  application/     # Use cases, ports
  adapters/        # Repository implementations
  validators/      # Zod schemas
  api-client/      # Generated tRPC client
  ui/              # Shared shadcn/ui components
docs/              # Docusaurus docs, ADRs, design diagrams
artifacts/         # Build artifacts, reports, metrics, coverage
```

## Coverage Architecture

Coverage uses **Istanbul** provider (not V8) with two output directories:

| Directory                    | Written by                           | Purpose                      |
| ---------------------------- | ------------------------------------ | ---------------------------- |
| `artifacts/coverage-vitest/` | TDD watch-mode / ad-hoc `--coverage` | Quick dev feedback           |
| `artifacts/coverage/`        | `scripts/run-coverage.js` (merged)   | Canonical data for SonarQube |

- **`pnpm test:coverage`** runs all 16 workspace projects sequentially, merges
  into `artifacts/coverage/`
- **`COVERAGE_RUN=1`** env var controls which dir Vitest targets + disables
  `forceExit`
- Background TDD processes **never** overwrite the merged SonarQube data

## Critical File Locations

- **Sprint_plan.csv/json**: `apps/project-tracker/docs/metrics/_global/`
- **Metrics Infrastructure**: `apps/project-tracker/docs/metrics/`
  - Task files: `sprint-N/phase-*/TASK-ID.json`
  - Schemas: `schemas/*.schema.json`
- **Sprint plan API**: `apps/project-tracker/app/api/sprint-plan/route.ts`
- **Dependency chains**:
  `docs/architecture/diagrams/complete-dependency-chains.md`

## Context by Area

Each subdirectory has its own AGENTS.md with area-specific rules and patterns:

| Directory                        | Key Topics                                                          |
| -------------------------------- | ------------------------------------------------------------------- |
| `apps/web/AGENTS.md`             | Next.js patterns, Lighthouse CI, build validation, coverage scoping |
| `apps/api/AGENTS.md`             | tRPC modules, container.ts wiring (CRITICAL), DTS resolution        |
| `apps/ai-worker/AGENTS.md`       | LangChain/CrewAI, Ollama dev, AI targets                            |
| `apps/project-tracker/AGENTS.md` | Single source of truth, JSON schemas, sync methods                  |
| `packages/domain/AGENTS.md`      | Zero infra deps, DRY enums, stale dist fix                          |
| `packages/db/AGENTS.md`          | Prisma 5.22.0, NEVER --no-engine, tenantId rule                     |
| `packages/adapters/AGENTS.md`    | Repository pattern, container wiring, mock casting                  |

## Reference Docs

Detailed guides loaded on-demand:

| Doc                                    | Topics                                                          |
| -------------------------------------- | --------------------------------------------------------------- |
| `docs/Codex-refs/sprint-plan-guide.md` | CSV columns, pre-req prefixes, dashboard views, task structure  |
| `docs/Codex-refs/architecture.md`      | DDD/hexagonal, events, AI patterns, design patterns, dep chains |
| `docs/Codex-refs/feature-workflow.md`  | 9-step feature creation, testing strategy, git workflow         |
| `docs/Codex-refs/dev-commands.md`      | All bash commands (setup, dev, test, db, lint, AI)              |
| `docs/Codex-refs/nonfunctional.md`     | Performance targets, security, monitoring                       |
| `docs/Codex-refs/gotchas.md`           | 14 common gotchas + testing-specific gotchas                    |
| `docs/Codex-refs/sprint-context.md`    | Sprint phases (0-33), decision gates                            |
| `docs/Codex-refs/ai-workflow.md`       | Codex workflows, Copilot, AI code gen                           |

## Critical Rules

### Never Mock or Simulate Data

All data displayed must come from real sources. If infrastructure unavailable,
show "pending" status. Never populate fields with fake values.

### Never Skip Build Validation

ALL 4 validations are NON-NEGOTIABLE: TypeScript, Tests, Lint, **Build**.
"Next.js compiles on demand" is NOT a valid reason to skip build.

### Sprint_plan.csv is Single Source of Truth

Always edit CSV for task updates. Run sync after changes. Never edit derived
JSON files directly.

### Git Destructive Guard (PreToolUse Hook)

A hook at `.Codex/hooks/git-destructive-guard.mjs` blocks destructive git
commands even in YOLO mode. **NEVER bypass or disable it.**

Blocked commands:

- `git push --force` (use `--force-with-lease`)
- `git reset --hard`, `git clean -f`, `git branch -D`
- `git checkout .`, `git checkout -- <any-path>` (discards local changes)
- `git restore <path>`, `git restore --worktree`, `git restore --source`
  (discards changes)
- `git stash` (all subcommands — can silently overwrite working tree)
- `git reflog expire/delete`

**If you need to discard changes to a file, tell the user to do it manually.**
Safe alternatives: `git restore --staged` (unstage only), `git diff -- <file>`
(view changes).

### Performance Notes

- Take your time to do this thoroughly
- Quality is more important than speed
- Do not skip validation steps

## Resources

- **Sprint Plan**: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- **Metrics Dashboard**: http://localhost:3002/
- **ADRs**: `docs/architecture/adr/`
- **Dependency Chains**:
  `docs/architecture/diagrams/complete-dependency-chains.md`
- **Design Mockups**: `docs/design/README.md`
