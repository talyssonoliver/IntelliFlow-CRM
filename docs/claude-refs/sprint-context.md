# Sprint Context

303 tasks across 34 sprints. Currently in Sprint 6 (MVP implementation phase).

## Sprint Phases

**Sprint 0 (Foundation)** — 27 tasks: AI tooling, environment, infrastructure, security foundations

**Completed Sprint 0 Tasks**:
- **ENV-004-AI**: Supabase Integration (2025-12-14, 5 min) — `supabase init`, config.toml, directory structure. Status: `apps/project-tracker/docs/metrics/sprint-0/phase-3-dependencies/ENV-004-AI.json`
- **EXC-SEC-001**: HashiCorp Vault Setup (2025-12-14, 6 min) — Vault v1.21.1 via Chocolatey, dev server on http://127.0.0.1:8200. Status: `apps/project-tracker/docs/metrics/sprint-0/phase-2-parallel/parallel-c/EXC-SEC-001.json`

**Sprint 1 (Validation)** — Architecture spike (IFC-001), domain model DDD (IFC-002), tRPC foundation (IFC-003), zero trust security (IFC-072), hexagonal boundaries (IFC-106)

**Sprint 2-4 (Core Domain)** — Lead, Contact, Account, Opportunity, Task aggregates (IFC-101–IFC-105), domain services (IFC-108), documentation setup (Docusaurus, LLM-friendly templates), testing infrastructure (TDD process, coverage enforcement)

**Sprint 5-15 (MVP & Intelligence)** — Lead capture UI, AI scoring, human-in-the-loop, workflow engine (LangGraph), auto-response, analytics dashboards, RAG, performance optimization

**Sprint 16-28 (Production & Scale)** — Production hardening, multi-region, public pages, auth flows, billing portal, complete CRM UI, compliance (GDPR, ISO 42001)

**Sprint 29-33 (Polish & Launch)** — UAT, internal launch, pilot customers, hypercare, success metrics

## Critical Decision Gates

| Gate | Sprint | Purpose |
|------|--------|---------|
| IFC-010 | 4 | Phase 1 Go/No-Go — modern stack validation |
| IFC-019 | 11 | Gate 1 — £500 investment review |
| IFC-027 | 15 | Gate 2 — £2000 investment (AI value proof) |
| IFC-034 | 19 | Gate 3 — £3000 investment (automation ROI) |
| IFC-049 | 26 | Gate 4 — £5000 investment (productization) |

IFC-010 passed on 2025-12-27 with unanimous GO decision.

## Task Dependencies

- Tasks reference dependencies by ID (e.g., IFC-003 depends on IFC-002)
- Cross-sprint dependencies are tracked
- Parallel execution opportunities identified where tasks are independent
- Always check Sprint_plan.csv for dependencies before implementing
