# Engineering Playbook

> Internal Developer Platform (IDP) golden paths and operational standards.
> Task: IFC-078 Platform Engineering Foundation

## Golden Paths

Golden paths are the recommended, supported ways to accomplish common development tasks in the IntelliFlow monorepo. Each path has a single entrypoint command, documented prerequisites, and a clear owner.

### 1. Web App Development

| Field | Value |
|-------|-------|
| **Entrypoint** | `pnpm --filter web dev` |
| **Ownership** | Frontend Lead |
| **Prerequisites** | Node 20+, pnpm 9+, `pnpm install` completed, `.env.local` configured |
| **Expected Output** | Next.js dev server at `http://localhost:3000` with hot reload |
| **Key Files** | `apps/web/`, `packages/ui/`, `packages/validators/` |
| **Testing** | `pnpm --filter web test` |
| **Build** | `pnpm --filter web build` |

**Workflow**: Create feature branch, implement in `apps/web/`, write tests, open PR, CI validates, merge.

### 2. API Development

| Field | Value |
|-------|-------|
| **Entrypoint** | `pnpm --filter api dev` |
| **Ownership** | Backend Lead |
| **Prerequisites** | Node 20+, pnpm 9+, PostgreSQL running (Docker or Supabase), `packages/db/.env` configured |
| **Expected Output** | tRPC API server at `http://localhost:3001` |
| **Key Files** | `apps/api/src/modules/`, `packages/application/`, `packages/domain/` |
| **Testing** | `pnpm --filter api test` |
| **Build** | `pnpm --filter api build` |

**Workflow**: Define Zod schema in `packages/validators/`, create domain model, build tRPC router, write tests, open PR.

### 3. AI Worker Development

| Field | Value |
|-------|-------|
| **Entrypoint** | `pnpm --filter ai-worker dev` |
| **Ownership** | AI Specialist |
| **Prerequisites** | Node 20+, pnpm 9+, OpenAI API key in env, Ollama running for local dev |
| **Expected Output** | AI worker process ready to consume jobs |
| **Key Files** | `apps/ai-worker/src/chains/`, `apps/ai-worker/src/agents/` |
| **Testing** | `pnpm --filter ai-worker test` |
| **Build** | `pnpm --filter ai-worker build` |

**Workflow**: Define chain/agent in `src/chains/` or `src/agents/`, add structured output schemas, write deterministic tests, open PR.

### 4. Database Migrations

| Field | Value |
|-------|-------|
| **Entrypoint** | `pnpm run db:migrate:create` |
| **Ownership** | DevOps + Backend Lead |
| **Prerequisites** | PostgreSQL running, `packages/db/.env` with `DATABASE_URL` configured |
| **Expected Output** | New migration file in `packages/db/prisma/migrations/` |
| **Key Files** | `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/` |
| **Apply** | `pnpm run db:migrate` |
| **Generate Client** | `pnpm run db:generate` |

**Workflow**: Edit `schema.prisma`, run `db:migrate:create`, verify migration SQL, apply with `db:migrate`, regenerate client.

## Branching & PRs

- Use feature branches (`feat/`, `fix/`, `docs/`, `refactor/`, `test/`)
- Keep PRs small and reviewable
- Require CI green before merge
- Follow conventional commit format (enforced via commitlint)

## Required Gates

All PRs must pass these gates before merge:

| Gate | Command | Required |
|------|---------|----------|
| TypeScript | `pnpm run typecheck` | Yes |
| Lint | `pnpm run lint` | Yes |
| Tests | `pnpm run test` | Yes |
| Build | `pnpm run build` | Yes |
| Sprint Validation | `pnpm run validate:sprint0 -- --strict` | Sprint 0 tasks |
| Data Validation | `pnpm run validate:sprint-data -- --strict` | Metrics changes |

## Evidence

- Runtime outputs belong under `artifacts/`
- Metrics under `apps/project-tracker/docs/metrics` must remain canonical
- All metric values must include provenance (source, collection method, timestamp)
- SHA256 hashes required for artifact verification

## Incidents

- Write a short incident note and remediation checklist
- Update runbooks where relevant
- Post-mortem within 48 hours for severity 1-2 incidents
