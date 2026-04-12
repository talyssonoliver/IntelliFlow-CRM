# CLAUDE.md

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
├── Sprint_plan_A.csv    # 67 rows (EXC-INIT-001 → IFC-042)
├── Sprint_plan_B.csv    # 72 rows (IFC-043 → PG-015)
├── Sprint_plan_C.csv    # 73 rows (PG-016 → SALES-002)
├── Sprint_plan_D.csv    # 69 rows (PM-OPS-001 → IFC-123)
├── Sprint_plan_E.csv    # 63 rows (IFC-124 → IFC-170)
├── Sprint_plan_F.csv    # 64 rows (IFC-171 → PG-156)
├── Sprint_plan_G.csv    # 64 rows (PG-157 → IFC-233)
├── Sprint_plan_H.csv    # 62 rows (IFC-234 → IFC-296)
└── Sprint_plan_I.csv    # 26 rows (IFC-297 → IFC-308)
```

Regenerate splits: `npx tsx tools/scripts/split-sprint-plan.ts` Full guide:
`docs/claude-refs/sprint-plan-guide.md`

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
- **Dependency chains**: `docs/design/diagrams/complete-dependency-chains.md`

## Context by Area

Each subdirectory has its own CLAUDE.md with area-specific rules and patterns:

| Directory                        | Key Topics                                                          |
| -------------------------------- | ------------------------------------------------------------------- |
| `apps/web/CLAUDE.md`             | Next.js patterns, Lighthouse CI, build validation, coverage scoping |
| `apps/api/CLAUDE.md`             | tRPC modules, container.ts wiring (CRITICAL), DTS resolution        |
| `apps/ai-worker/CLAUDE.md`       | LangChain/CrewAI, Ollama dev, AI targets                            |
| `apps/project-tracker/CLAUDE.md` | Single source of truth, JSON schemas, sync methods                  |
| `packages/domain/CLAUDE.md`      | Zero infra deps, DRY enums, stale dist fix                          |
| `packages/db/CLAUDE.md`          | Prisma 5.22.0, NEVER --no-engine, tenantId rule                     |
| `packages/adapters/CLAUDE.md`    | Repository pattern, container wiring, mock casting                  |

## Reference Docs

Detailed guides loaded on-demand:

| Doc                                     | Topics                                                          |
| --------------------------------------- | --------------------------------------------------------------- |
| `docs/claude-refs/sprint-plan-guide.md` | CSV columns, pre-req prefixes, dashboard views, task structure  |
| `docs/claude-refs/architecture.md`      | DDD/hexagonal, events, AI patterns, design patterns, dep chains |
| `docs/claude-refs/feature-workflow.md`  | 9-step feature creation, testing strategy, git workflow         |
| `docs/claude-refs/dev-commands.md`      | All bash commands (setup, dev, test, db, lint, AI)              |
| `docs/claude-refs/nonfunctional.md`     | Performance targets, security, monitoring                       |
| `docs/claude-refs/gotchas.md`           | 14 common gotchas + testing-specific gotchas                    |
| `docs/claude-refs/sprint-context.md`    | Sprint phases (0-33), decision gates                            |
| `docs/claude-refs/ai-workflow.md`       | Claude Code workflows, Copilot, AI code gen                     |

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

A hook at `.claude/hooks/git-destructive-guard.mjs` blocks destructive git
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

## Session Continuation

`docs/SESSION_CONTEXT.md` is the cross-session handoff file — a compact digest
of the current working state generated from the metrics tree + git.

**Rules:**

1. **At the start of every new session**, read `docs/SESSION_CONTEXT.md` before
   doing anything else. It tells you which sprint is active, what's in progress,
   what blockers exist, and what the next unblocked tasks are. Its **Project
   Health** section shows project-wide completion % and evidence health from the
   full state report.
2. **After completing a task or before running out of context**, regenerate it
   so the next session starts from an accurate snapshot:
   - CLI: `npx tsx apps/project-tracker/scripts/generate-context.ts`
   - API: `curl -X POST http://localhost:3002/api/context`
   - Slash command: `/refresh-context`
   - All three also regenerate `docs/CURRENT_STATE_REPORT.md` automatically.
3. **Never edit `docs/SESSION_CONTEXT.md` by hand** — it is derived from the
   metrics files, same discipline as `Sprint_plan.json`.
4. **For full sprint-by-sprint detail**, read `docs/CURRENT_STATE_REPORT.md` —
   the deep reference with per-sprint breakdowns, attestation evidence, and
   source health diagnostics. Generated from `.specify/` attestations + CSV.

**Generator sources**:
- Session digest: `apps/project-tracker/lib/context-snapshot.ts`
- Full state report: `apps/project-tracker/lib/current-state-report.ts`

## Resources

- **Sprint Plan**: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- **Session Context** (quick digest): `docs/SESSION_CONTEXT.md`
- **Current State Report** (full detail): `docs/CURRENT_STATE_REPORT.md`
- **Metrics Dashboard**: http://localhost:3002/
- **Context Snapshot API**: http://localhost:3002/api/context (GET = view, POST
  = regenerate — also refreshes the state report)
- **ADRs**: `docs/planning/adr/`
- **Dependency Chains**: `docs/design/diagrams/complete-dependency-chains.md`
- **Design Mockups**: `docs/design/README.md`
