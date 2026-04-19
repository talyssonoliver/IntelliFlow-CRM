# Spec Session — Context Hydration & Agent Selection

## Phase 0: Context Hydration

Automatically hydrates context if not done. Gathers task metadata, dependencies,
codebase patterns.

## Phase 0.5: Agent Selection

Analyzes task domain and selects 3-5 agents. Always includes: Domain-Expert,
Test-Engineer.

### Agent Roles

| Agent             | Expertise                        | Triggers                   |
| ----------------- | -------------------------------- | -------------------------- |
| Backend-Architect | API, tRPC, Prisma, Node.js       | router, endpoint, database |
| Frontend-Lead     | React, Next.js, Tailwind, shadcn | component, page, UI        |
| AI-Specialist     | LangChain, embeddings, LLM       | AI, ML, scoring, prompt    |
| Security-Lead     | Auth, RBAC, OWASP                | auth, jwt, secret          |
| Domain-Expert     | CRM, leads, business logic       | Always included            |
| Test-Engineer     | Vitest, Playwright, TDD          | Always included            |
| DevOps-Lead       | Docker, CI/CD                    | docker, deploy, pipeline   |
| Data-Engineer     | Prisma, PostgreSQL, Supabase     | schema, migration          |
| A11y-Expert       | WCAG, accessibility, ARIA        | accessibility, a11y        |
| Compliance        | GDPR, ISO, audit, legal          | compliance, privacy        |

### Agent File Mapping

| Agent Role        | Agent File                            |
| ----------------- | ------------------------------------- |
| Backend-Architect | `.claude/agents/backend-architect.md` |
| Frontend-Lead     | `.claude/agents/frontend-lead.md`     |
| AI-Specialist     | `.claude/agents/ai-specialist.md`     |
| Security-Lead     | `.claude/agents/security-lead.md`     |
| Domain-Expert     | `.claude/agents/domain-expert.md`     |
| Test-Engineer     | `.claude/agents/test-engineer.md`     |
| DevOps-Lead       | `.claude/agents/devops-lead.md`       |
| Data-Engineer     | `.claude/agents/data-engineer.md`     |
| A11y-Expert       | `.claude/agents/a11y-expert.md`       |
| Compliance        | `.claude/agents/compliance.md`        |

## Phase 0.75: Codebase Exploration (CRITICAL)

> **STOP** — You MUST invoke `/spec-exploration <TASK_ID>` before any analysis
> rounds. Each agent MUST use tools (Read, Grep, Glob) to verify code before
> reasoning about it. See `/spec-exploration` for exploration templates and
> verification checklist.

## CRITICAL: Metrics Recording

At session **START**, record to task JSON at
`apps/project-tracker/docs/metrics/sprint-{N}/phase-*/TASK-ID.json`:

- `started_at`, `status: "Specifying"`, `status_history` entry, `executor`,
  `agents`

At session **END**, record:

- `status: "Spec Complete"`, `status_history` entry, `artifacts.created` with
  SHA256 hash

## Requirements Flow

- Performs **Analise de Requisitos**: document user/domain needs, constraints,
  regulations, existing systems.
- **PRD/ADR resolution is handled in Phase 0.97** — see
  `references/prd-adr-resolution.md`.
  - User-facing tasks → create or reference PRD in `docs/planning/`
  - Architectural decisions → create or reference ADR in
    `docs/architecture/adr/`
  - Spec output MUST include `## Related Documents` section with PRD/ADR paths
- Specs link PRD/ADR and feed into plan-session DoR/DoD checks.

## Integration with MATOP

```
Phase 0:   Context Hydration
Phase 0.5: Agent Selection
Phase 1:   Spec Session    ← THIS COMMAND
Phase 2:   Plan Session
Phase 3:   Gate Execution
```
