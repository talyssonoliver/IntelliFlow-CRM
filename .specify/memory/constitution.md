# IntelliFlow CRM — Constitution

**Status:** Active
**Last updated:** 2026-04-09
**Scope:** Binding project principles every task and agent must honor. Read `Framework.md` in the same directory for governance process (STOAs, gates, evidence).

---

## 0) Purpose

The Constitution is the short, durable list of principles that govern how code is written, architected, and secured in this repository. It is intentionally opinionated and short. When it conflicts with convenience, the Constitution wins.

`Framework.md` defines **how** we prove work is done. This document defines **what** the work must look like.

---

## 1) Technology Stack (current canonical)

1. **Monorepo**: Turborepo + pnpm workspaces
2. **Frontend**: Next.js 16 App Router (16.0.10+), React 19, Tailwind CSS 4, shadcn/ui
3. **Backend**: tRPC (11.x), Prisma ORM (7.4.2 with `engineType = "client"` + `@prisma/adapter-pg`), PostgreSQL via Supabase
4. **AI/LLM**: LangChain, CrewAI, OpenAI, Ollama (local dev)
5. **Validation**: Zod for every boundary
6. **Testing**: Vitest (Istanbul coverage — NOT V8), Playwright
7. **Observability**: OpenTelemetry, Sentry
8. **Infra**: Docker Compose (dev), Railway/Vercel (prod)
9. **TypeScript**: strict mode only — no `any` in production paths without an explicit comment justifying it
10. **Node.js**: LTS (24.x) for runtime

**Versions drift; principles do not.** When a version changes, update this file.

---

## 2) Architecture Rules

1. **Hexagonal / DDD boundaries**: `packages/domain` has **zero** infrastructure dependencies. Repositories and external services live behind ports in `packages/application`; concrete adapters live in `packages/adapters`.
2. **No circular dependencies** — enforced by `madge-circular` and `dependency-cruiser-validate` where enabled.
3. **Single source of truth for data**: Prisma schema in `packages/db/prisma/schema.prisma`. All database access goes through `@intelliflow/db` — never import from `@prisma/client` directly.
4. **Every `new PrismaClient()` MUST pass `{ adapter: new PrismaPg({...}) }`** — see `packages/db/CLAUDE.md`.
5. **tRPC is the only backend API contract.** No REST on the side. No GraphQL. tRPC router modules live in `apps/api/src/modules/*/router.ts` and are composed in `apps/api/src/router.ts`.
6. **Container wiring is mandatory** for every new service: register in `container.ts` AND `context.ts`. Static type checks will pass even when a service is never instantiated — Gate 5 (Container Registration) is the check that actually catches broken wiring.
7. **No runtime artifacts in source docs**: `apps/**/docs/**` is for markdown/reference only. Runtime outputs go under `artifacts/` or `.specify/sprints/sprint-{N}/attestations/{TASK_ID}/`.
8. **JSDoc on exported functions** where the signature or contract is non-obvious. Self-evident code does NOT need a comment.
9. **No speculative abstractions.** Three similar lines is better than a premature abstraction. Add the abstraction when the third use arrives.
10. **Shared components are reused, not re-created.** Before building a new UI component, search `packages/ui/` and `apps/web/src/components/shared/` by **function keyword** (filter, table, avatar, empty state), not by exact name. Enforced by Exec Gate 2d.

---

## 3) Security Rules

1. **No secrets in code.** No `.env` files committed. No API keys or tokens in commits, tests, or docs. `gitleaks` is a Tier 1 blocker.
2. **Input validation at every boundary.** Zod schemas on every tRPC input, every form, every external API response.
3. **No stack traces exposed to clients.** Production errors are logged with context and surfaced as generic messages. Development may surface more detail.
4. **Tenant isolation is not optional.** Every query that could touch tenant data MUST filter by `tenantId`. See `packages/db/CLAUDE.md` for the tenantId rule.
5. **Authentication and authorization are middleware concerns**, not scattered in handlers. Any new route must either declare `public: true` explicitly or go through the authenticated tRPC procedure.
6. **Dependency hygiene**: `pnpm-audit-high` blocks high/critical vulnerabilities. SBOM updates on every release (`syft`, `cosign` where enabled).
7. **Least privilege for AI agents.** Agents spawned by the swarm or by Claude Code skills must receive only the tools they need for the task at hand.

---

## 4) Data Integrity Rules

1. **Never mock or simulate data in production paths.** If infrastructure is unavailable, show "pending" or "not available" — never populate with fake values. Dashboards, reports, and metrics must use real data only.
2. **Cryptographic evidence is non-negotiable.** SHA256 hashes for artifacts, stdout hashes for command execution, ISO 8601 timestamps for audit trails, real validation exit codes. No hand-written "passed" statuses.
3. **JSON schemas enforce integrity.** Schemas at `apps/project-tracker/docs/metrics/schemas/` use `additionalProperties: false`. Validate JSON against schema BEFORE writing — don't create then fix.
4. **Attestation field contract**: `attestation.json` uses `"verdict"` (not `"status"`) — the CSV column is Status but the attestation schema field is verdict. See PG-161 lesson in Framework.md §6.3.
5. **Coverage is measured, not claimed.** Use Istanbul provider. Thresholds: Statements ≥90, Branches ≥80, Functions ≥90, Lines ≥90. KPIs must show actual percentages, not "N tests passing".

---

## 5) Testing Rules

1. **ALL 4 validations are non-negotiable**: TypeScript, Tests, Lint, **Build**. "Next.js compiles on demand" is NOT a valid reason to skip Build.
2. **Test-Driven Development**: `/plan-session` produces RED-GREEN-REFACTOR steps. RED must come first.
3. **Plan checkboxes are incremental.** Tick `- [ ]` → `- [x]` in the plan file as each step lands, NOT in bulk at the end (IFC-183 lesson).
4. **Integration tests hit a real database**, not mocks — prior incident where mocked tests passed but prod migration failed.
5. **Test count is NOT a proxy for coverage.** A task can add 100 tests and still be below the coverage floor.
6. **E2E tests for UI pages** live under `tests/e2e/` or app-specific Playwright suites.

---

## 6) Git & Release Rules

1. **NEVER bypass the git-destructive-guard** at `.claude/hooks/git-destructive-guard.mjs`. Blocked commands have safer alternatives.
2. **Always create NEW commits** rather than amending published commits.
3. **Never skip hooks** (`--no-verify`, `--no-gpg-sign`) unless the user explicitly asks.
4. **PR titles under 70 characters.** Body carries the detail.
5. **No force-push to main/master**, ever.

---

## 7) AI Agent Rules

1. **Agents must acknowledge context before changing code.** Produce `context_ack.json` with files read + SHA256 hashes. Gate 10 enforces.
2. **Never mark a task "deferred" without verifying the dependency is actually unfinished.** Check the code, check `Sprint_plan.csv`, check for existing hooks/services before deferring. See "False Deferral Anti-Pattern" in project memory.
3. **Never suggest removing "dead" backend endpoints** — they were created with a purpose. Instead: wire them by building the frontend. See "Dead Endpoint Policy" in project memory.
4. **Governance files are mandatory reading** for any task that declares them as prerequisites:
   - `.specify/memory/Framework.md` — STOA governance process
   - `.specify/memory/constitution.md` — this document
   - `audit-matrix.yml` — tool definitions
5. **Operational framework is the skill triad**: `/spec-session` → `/plan-session` → `/exec`. Human-provided answer files go in `.specify/sprints/sprint-{N}/questions/{TASK_ID}_answers.md`.

---

## 8) CSV Governance

The `Sprint_plan.csv` at `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` is the **single source of truth** for all tasks. All other JSON files are derived.

1. **Agents MUST NOT directly edit the CSV.** Produce a CSV Patch Proposal (see Framework.md §11).
2. **Never edit derived JSON files directly** — they'll be overwritten by sync.
3. **Always sync after CSV edits** via UI button, `curl`, or `pnpm exec tsx scripts/sync-metrics.ts`.
4. **Status enum**: Only `Planned`, `Backlog`, `In Progress`, `Validating`, `Completed`, `Blocked`, `Failed`, `Needs Human`, `In Review`.

---

## 9) Performance Rules

1. **Lighthouse ≥0.9** on performance, a11y, best-practices, SEO for every page route tracked in `lighthouserc.js`.
2. **p95 API latency ≤ 300ms** for tRPC procedures under normal load.
3. **Bundle size is budgeted.** Check `size-limit` where enabled; do not add megabytes without a reason.
4. **Streaming by default** for AI responses and long-running operations.

---

## 10) Documentation Rules

1. **CLAUDE.md files per area** (`apps/*/CLAUDE.md`, `packages/*/CLAUDE.md`) carry area-specific rules. The root `CLAUDE.md` points to them.
2. **ADRs for architectural decisions** at `docs/architecture/adr/ADR-{NNN}-<slug>.md`. Template: `docs/architecture/adr/template.md`.
3. **PRDs for product features** at `docs/planning/prd-<feature>.md`. Template: `docs/planning/prd-template.md`.
4. **PG-*/IFC-* UI tasks require a PRD.** ENV-*/architecture tasks require an ADR. Enforced at multiple pipeline checkpoints (hydrate-context §4.1, spec-session Phase 0.97, plan-session step 2, plan-reviewer BB).

---

## 11) Non-Delegable Human Responsibilities

See Framework.md §10 for the full list. Short version:
- Approving CSV changes
- Approving waivers
- Managing secrets and credentials
- Resolving `NEEDS_HUMAN` escalations
- Deciding merge/release when uncertainty exists

---

## Amendment

The Constitution is amended by PR + human approval. The PR must explain which rule changes, why, and what downstream systems need updating. Agents MUST NOT amend this file unilaterally.
