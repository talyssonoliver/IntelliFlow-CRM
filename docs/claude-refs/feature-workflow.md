# Feature Development Workflow

## Creating a New Feature (9 Steps)

1. **Check Sprint Plan**: Locate task in `Sprint_plan.csv`. Review dependencies, pre-requisites, DoD, KPIs, artifacts, validation method.
2. **Define ADR** in `docs/planning/adr/` if architectural change.
3. **Update Domain Model**: Add entities/value objects to `packages/domain/`. Follow hexagonal architecture. Domain has NO infrastructure dependencies.
4. **Create Prisma Migration**: Update schema in `packages/db/`, generate migration. Tracked in `infra/supabase/migrations/`. Run `pnpm run db:migrate:create`.
5. **Build tRPC Router**: Typed endpoints in `apps/api/src/modules/`. Follow tRPC naming conventions. Ensure end-to-end type safety.
6. **Implement UI**: Next.js pages/components in `apps/web/`. Use shadcn/ui from `packages/ui/`. Target: Lighthouse >90, response <200ms.
7. **Write Tests**: Achieve >90% coverage. Domain >95%, Application >90%, Overall >90% (CI enforced).
8. **Generate Artifacts**: Benchmarks → `artifacts/benchmarks/`, Coverage → `artifacts/coverage/`, Metrics → `artifacts/metrics/`, Docs → `docs/`.
9. **Validate Completion**: Verify all KPIs from sprint plan are met.

## Testing Strategy

- **Unit Tests**: Domain logic in isolation (Vitest)
- **Integration Tests**: API endpoints with test database
- **E2E Tests**: Critical user flows (Playwright)
- **Contract Tests**: tRPC type contracts
- **AI Tests**: AI chains with deterministic outputs

### Coverage Requirements

| Layer | Minimum |
|-------|---------|
| Domain | >95% |
| Application | >90% |
| API routes | >85% |
| Overall | >90% (CI enforced) |

## Git Workflow

- **Conventional Commits**: Enforced via commitlint
- **Branch Naming**: `feat/`, `fix/`, `docs/`, `refactor/`, `test/`
- **PR Requirements**: All tests passing, coverage thresholds met, no lint errors, architecture tests passing (no boundary violations)

## Artifact Conventions (IFC-160)

- Performance reports: `artifacts/benchmarks/`
- Test coverage: `artifacts/coverage/`
- Configuration: `artifacts/misc/` (access-policy.json, commitlint.config.js, docker-compose.yml, docusaurus.config.js, health-check.yaml, vault-config.yaml, workflow-automation.yaml)
- Metrics: `artifacts/metrics/`
- Reports: `artifacts/reports/`
- Paths are linted in CI — wrong paths cause failures
- Track relocations in `scripts/migration/artifact-move-map.csv`

## Metrics & Task Completion

When completing a Sprint_plan task:
1. Update Sprint_plan.csv: Status → "Completed"
2. Create `{TASK-ID}.json` in appropriate phase folder
3. Update `_phase-summary.json` aggregated metrics
4. Update sprint `_summary.json` with new totals
5. Verify dashboard at http://localhost:3002/ shows update

### Required Task JSON Fields

- `task_id`, `section`, `description`, `owner`
- `dependencies` with verification timestamp
- `status_history` with ISO 8601 timestamps
- `execution` details (duration, executor, log path)
- `artifacts.created` with SHA256 hashes — must be objects `{ path, sha256, created_at }`, NOT strings
- `validations` with command, exit code, passed status
- `kpis` with target vs actual and `met` boolean
- `blockers` with `raised_at` and `resolved_at`

**Example completed task JSON files**:
- `apps/project-tracker/docs/metrics/sprint-0/phase-3-dependencies/ENV-004-AI.json`
- `apps/project-tracker/docs/metrics/sprint-0/phase-2-parallel/parallel-c/EXC-SEC-001.json`

## Anti-Fabrication Measures

All metrics use cryptographic verification — **NEVER** simulate, mock, or fabricate data:

- **SHA256 hashes**: Prove artifact creation (`certutil -hashfile <path> SHA256` on Windows)
- **Stdout hashes**: Verify command execution
- **ISO 8601 timestamps**: Immutable audit trail
- **Validation exit codes**: Prove test success (must come from actual execution)
- **JSON schemas**: Enforce data integrity (`additionalProperties: false`)

If infrastructure is unavailable, display "pending" or "not available" — never populate with fake/sample values.
