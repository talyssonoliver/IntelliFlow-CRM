# Context Pack: IFC-074

**Run ID:** 20261022194925-cdddf208
**Generated:** 2026-10-22T19:49:27.558Z

## Task Details

- **Section:** Observability
- **Description:** PHASE-040: Full Stack Observability
- **Status:** Plan Complete
- **Target Sprint:** 18

## File Excerpts

### 📄 .specify/memory/Framework.md (truncated: 120/786 lines)

**SHA256:** `62bfcd54fccbfcb5dcf3a67b4811d638371191fa1c51d11ddd8218be6f5e26ad`

```
# IntelliFlow-CRM: STOA Framework — Governance Reference

**Status:** Active
**Version:** v5.0 (binary-gate policy)
**Last updated:** 2026-04-09
**Replaces:** `artifacts/sprint0/codex-run/Framework.md` v4.3 FINAL (deleted in commit `ea020464`, 2026-01-29)

---

## 0) How this document is used

This file is the **governance reference** for the IntelliFlow-CRM task factory. It is:

1. A **required prerequisite** (`FILE:.specify/memory/Framework.md`) for every task in `Sprint_plan.csv` — ~333 rows declare it in their `Pre-requisites` column.
2. The **specification source** for code under `tools/scripts/lib/stoa/*`, which cites section numbers from this document (`gate-selection.ts §5.1.2`, `stoa-assignment.ts §3`, `evidence.ts §8`, etc.).
3. Ingested by the **context pack builder** (`tools/scripts/lib/context-pack-builder.ts`) as an excerpt for every task run.

**Day-to-day execution uses skills, not this document.** The operational framework is the triad of Claude Code skills:

| Skill | Phase | Purpose |
|---|---|---|
| [`/spec-session`](../../.claude/skills/spec-session/SKILL.md) | 1 — Specification | Multi-round parallel sub-agent specification with PRD/ADR governance |
| [`/plan-session`](../../.claude/skills/plan-session/SKILL.md) | 2 — TDD Plan | Decomposes acceptance criteria into RED-GREEN-REFACTOR steps |
| [`/exec`](../../.claude/skills/exec/SKILL.md) | 3 — Execute + validate | TDD implementation, gates, attestation, metrics |

**This document defines the contracts those skills enforce.** If you need to know *how* to run a phase, read the skill. If you need to know *why* a rule exists or *what* invariant it enforces, read this file.

---

## 1) Non-Negotiables

1. **Gatekeeper is final** — a task cannot ship if deterministic gates fail, regardless of any verdict above them.
2. **Evidence-first** — every verdict must reference artifacts, gate transcripts, and SHA256 hashes.
3. **Determinism** — STOA ownership, supporting sign-offs, and gate profiles must be computable from task metadata alone.
4. **Separation of concerns** — runtime outputs never live inside source documentation directories (`docs/**`, `apps/**/docs/**`).
5. **Single source of truth** — `Sprint_plan.csv` at its canonical location is authoritative; all other files derive from it.
6. **Binary gates** — every gate is `PASS` / `FAIL` / `NEEDS_HUMAN`. There is no `WARN`. No `SKIP`. No partial credit.

---

## 2) Canonical File Locations

### 2.1 Source-of-truth files (Git-tracked)

| File | Canonical Path | Purpose |
|---|---|---|
| Sprint Plan CSV | `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` | Single source of truth for all tasks |
| Sprint Plan JSON | `apps/project-tracker/docs/metrics/_global/Sprint_plan.json` | Derived from CSV |
| Task Registry | `apps/project-tracker/docs/metrics/_global/task-registry.json` | Central status tracking |
| Task Status Files | `apps/project-tracker/docs/metrics/sprint-{N}/phase-*/*.json` | Per-task execution details |
| Phase Summaries | `apps/project-tracker/docs/metrics/sprint-{N}/phase-*/_phase-summary.json` | Aggregated phase metrics |
| Sprint Summary | `apps/project-tracker/docs/metrics/sprint-{N}/_summary.json` | Sprint-level aggregation |
| JSON Schemas | `apps/project-tracker/docs/metrics/schemas/*.schema.json` | Validation schemas |
| Audit Matrix | `audit-matrix.yml` (repo root) | Canonical tool definitions |
| **This document** | `.specify/memory/Framework.md` | Governance reference |

### 2.2 Per-task evidence (sprint-scoped)

```
.specify/sprints/sprint-{N}/attestations/{TASK_ID}/
[... 666 lines omitted ...]
2. **Context Ack Gatekeeper** requires `context_ack.json` before code changes:
   ```typescript
   interface ContextAck {
     task_id: string;                      // Must match task being executed
     run_id: string;                       // YYYYMMDD-HHMMSS-<task_id>-<random_4_hex>
     files_read: FileReadEntry[];          // Path + SHA256 for each file
     invariants_acknowledged: string[];    // Min 5 items
     created_at: string;                   // ISO 8601
   }
   ```

3. **Gates 9 and 10:**
   - Gate 9: Contract Tag Parser — validates tag syntax, NOELLIPSIS rule
   - Gate 10: Context Ack Gate — validates `context_ack.json` for In Progress tasks

---

## Appendix E — Column Deprecation Plan

The following CSV columns are scheduled for deprecation (they can be derived):

### E.1 CleanDependencies

**Derivation:** `generateCleanDependencies(Dependencies)` — split by comma, trim, dedupe, sort alphabetically, rejoin.

### E.2 CrossQuarterDeps

**Derivation:** `computeCrossQuarterDeps(task, allTasks)` — if any dependency is in a different quarter (4 sprints per quarter), return True.

**Timeline (both columns):**
- Sprint N: Warn when CSV diverges from generated value
- Sprint N+1: FAIL in strict mode
- Sprint N+2: Remove column from CSV; registry generates value

---

## Appendix F — Migration Notes (v4.3 → v5.0)

**Deleted:** `artifacts/sprint0/codex-run/Framework.md` (v4.3 FINAL, 1001 lines) in commit `ea020464` (2026-01-29)
**New canonical path:** `.specify/memory/Framework.md` (this file)

**Policy changes from v4.3:**

1. **Binary gates**: `WARN` removed from `VerdictType`, `MatopVerdict`. Only `PASS`, `FAIL`, `NEEDS_HUMAN`. Updated in `tools/scripts/lib/stoa/types.ts` and `tools/scripts/lib/workflow/types.ts` on 2026-03-11.
2. **`primaryStoa` replaces `leadStoa`**: Cosmetic rename in TypeScript code (all STOAs block equally).
3. **Coverage branches threshold**: Corrected from 90 to 80 to match canonical project policy.
4. **Coverage provider**: Istanbul (not V8) per coverage architecture in CLAUDE.md.
5. **Attestation field contract**: `verdict` (not `status`) — PG-161 lesson.
6. **`context_ack.json` filename**: Plain only, NO `{TASK_ID}-` prefix.
7. **Evidence path contract**: `.specify/sprints/sprint-{N}/attestations/{TASK_ID}/`, NOT `execution/{run_id}/`.
8. **Extended prefix table**: `PG-*`, `DOC-*`, `BRAND-*`, `GTM-*`, `SALES-*`, `PM-OPS-*`, `ENG-OPS-*`, `GOV-*`, `ANALYTICS-*` now mapped.
9. **Operational framework is skills**: `/spec-session`, `/plan-session`, `/exec` replace the MATOP agent prompts described in v4.3.

**Unchanged:**
- Evidence bundle structure under `artifacts/reports/system-audit/<RUN_ID>/`
- Gate selection algorithm and STOA-specific add-ons
- CSV governance (proposal-based)
- Tier 1 baseline gates
- Non-negotiables from Section 1

```

### 📄 audit-matrix.yml (truncated: 120/502 lines)

**SHA256:** `bff47a6dd151d7ee3b173d9f47367687237102f4640e49212dac9addf7e0a7ff`

```
schema_version: '1.0.0'
last_updated: '2026-03-05'
maintainer: 'Tech Lead'

# Canonical tool matrix for system audits.
# - tier 1: blockers (fail PR if required=true and tool fails)
# - tier 2: warnings (do not fail PR unless --fail-on-warn)
# - tier 3: scheduled (nightly/manual)
#
# Notes:
# - Some tools are defined but disabled until the repo/team standardizes installation.
# - Enable/disable and enforcement are controlled here; the runner is deterministic.
tools:
  # ---------------------------------------------------------------------------
  # Tier 1 blockers
  # ---------------------------------------------------------------------------
  - id: turbo-typecheck
    tier: 1
    enabled: true
    required: true
    owner: 'Tech Lead'
    scope: 'workspace'
    command: 'pnpm run typecheck'
    thresholds: {}
    expected_outputs: ['log']

  - id: turbo-build
    tier: 1
    enabled: true
    required: true
    owner: 'Tech Lead'
    scope: 'workspace'
    command: 'pnpm run build'
    thresholds: {}
    expected_outputs: ['log']

  - id: turbo-test-coverage
    tier: 1
    enabled: true
    required: true
    owner: 'QA Lead'
    scope: 'workspace'
    command: 'pnpm exec turbo run test:coverage'
    thresholds:
      coverage_min: 90
    expected_outputs: ['log']

  - id: eslint-max-warnings-0
    tier: 1
    enabled: true
    required: true
    owner: 'Frontend Dev'
    scope: 'workspace'
    command: 'pnpm exec eslint --max-warnings=0 .'
    thresholds:
      max_warnings: 0
    expected_outputs: ['log']

  - id: prettier-check
    tier: 1
[... 382 lines omitted ...]
    enabled: false
    required: false
    owner: 'Performance Engineer'
    scope: 'workspace'
    command: 'clinic doctor -- node server.js'
    thresholds: {}
    expected_outputs: ['log']

  - id: syft
    tier: 3
    enabled: false
    required: false
    owner: 'Security'
    scope: 'repo'
    command: 'syft dir:. -o json'
    thresholds:
      sbom_coverage: 100
    expected_outputs: ['log', 'json']

  - id: cosign
    tier: 3
    enabled: false
    required: false
    owner: 'Security'
    scope: 'repo'
    command: 'cosign version'
    thresholds: {}
    expected_outputs: ['log']

  - id: size-limit
    tier: 3
    enabled: false
    required: false
    owner: 'Performance Engineer'
    scope: 'workspace'
    command: 'pnpm exec size-limit'
    thresholds: {}
    expected_outputs: ['log']

  - id: langfuse-audit
    tier: 3
    enabled: false
    required: false
    owner: 'AI Specialist'
    scope: 'workspace'
    command: 'echo "langfuse audit: run via ops playbook"'
    thresholds:
      hallucination_rate_max: 5
    expected_outputs: ['log']

  - id: garak
    tier: 3
    enabled: false
    required: false
    owner: 'AI Specialist'
    scope: 'workspace'
    command: 'echo "garak: run via ops playbook"'
    thresholds: {}
    expected_outputs: ['log']

```

### 📄 docs/architecture/adr/ADR-001-modern-stack.md (truncated: 120/615 lines)

**SHA256:** `458b7acba09e5bfac4323c934b13c4d814885f02545271814fb01c40c33fe8a2`

```
# ADR-001: Modern AI-First Technology Stack

**Status:** Accepted

**Date:** 2025-12-20

**Deciders:** CTO, Tech Lead, Architecture Team

**Technical Story:** IFC-001 - Technical Architecture Spike - Modern Stack

## Context and Problem Statement

IntelliFlow CRM is being built as an AI-native CRM system that emphasizes
automation, type safety, and developer productivity. We need to select a modern
technology stack that enables rapid AI-assisted development while maintaining
production-grade quality, performance, and maintainability. How should we
architect our technology stack to maximize AI integration, type safety, and
development velocity?

## Decision Drivers

- **End-to-end Type Safety**: Prevent runtime errors through compile-time
  validation across the entire stack (database → backend → frontend)
- **AI-First Architecture**: Enable seamless integration with LLMs (OpenAI,
  Ollama), vector databases, and agent frameworks
- **Developer Productivity**: Optimize for AI-assisted coding with tools like
  Claude Code and GitHub Copilot
- **Monorepo Scalability**: Support multiple applications and shared packages
  with efficient build caching
- **Performance Targets**: API response time p95 < 100ms, p99 < 200ms; Frontend
  FCP < 1s
- **Modern Tooling**: Leverage cutting-edge tools that improve DX without
  sacrificing stability
- **Cost Optimization**: Minimize infrastructure costs while maintaining quality
- **Production Readiness**: Battle-tested technologies with strong community
  support

## Considered Options

- **Option 1**: Modern TypeScript Stack (Turborepo, tRPC, Prisma, Next.js 16,
  Supabase, LangChain)
- **Option 2**: Traditional Stack (Express.js, REST API, TypeORM, React SPA,
  MySQL, Custom AI)
- **Option 3**: Enterprise Stack (NestJS, GraphQL, TypeORM, Angular, AWS RDS,
  AWS Lambda)
- **Option 4**: Serverless-First (Vercel Functions, GraphQL, Prisma, Next.js,
  PlanetScale, OpenAI Functions)

## Decision Outcome

Chosen option: **"Modern TypeScript Stack"** (Option 1), because it provides the
best combination of type safety, AI integration, developer experience, and
performance while maintaining production readiness. This stack enables
end-to-end type safety without code generation, seamless AI/LLM integration, and
optimal DX for AI-assisted development.

### Positive Consequences

- **Complete Type Safety**: TypeScript types flow from database schema (Prisma)
  → API (tRPC) → frontend (Next.js) without manual synchronization
[... 495 lines omitted ...]
   - Replace LangChain with LlamaIndex, direct OpenAI, or custom
   - Keep prompts and business logic
   - Estimated effort: 1-2 weeks

### Rollback Plan

If the modern stack proves problematic during Sprint 1-4:

1. Maintain current architecture but simplify:
   - Keep Prisma + PostgreSQL (stable and proven)
   - Replace tRPC with REST API + OpenAPI/Swagger
   - Keep Next.js but use Pages Router (more stable)
   - Replace LangChain with direct OpenAI API calls

2. Triggers for rollback consideration:
   - Type safety causing more bugs than preventing (unlikely)
   - tRPC limitations blocking critical features
   - LangChain instability impacting development velocity
   - Team unable to learn modern patterns within sprint timeline

3. Decision gate: IFC-010 (Sprint 4) - Phase 1 Go/No-Go
   - Review: Stack productivity, bug rates, developer satisfaction
   - Metrics: Build times, development velocity, time to implement features
   - If metrics fail to meet targets, evaluate rollback or adjustments

## Links

- [tRPC Documentation](https://trpc.io)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [LangChain Documentation](https://js.langchain.com/docs)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Architecture Overview](../../architecture/overview.md)
- [Sprint Plan Task: IFC-001](../../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)
- [Performance Benchmark](../../../artifacts/benchmarks/performance-benchmark.json)
- [Architecture Spike POC](../../../artifacts/misc/architecture-spike/)

## References

- Hexagonal Architecture:
  [Alistair Cockburn](https://alistair.cockburn.us/hexagonal-architecture/)
- Domain-Driven Design:
  [Martin Fowler](https://martinfowler.com/tags/domain%20driven%20design.html)
- Type-Safe APIs: [tRPC vs GraphQL vs REST](https://trpc.io/docs/concepts)
- Modern React:
  [React Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- AI Integration: [LangChain Concepts](https://js.langchain.com/docs/concepts)

---

**Conclusion**: The modern TypeScript stack (Turborepo, tRPC, Prisma, Next.js
16, Supabase, LangChain) provides the optimal foundation for IntelliFlow CRM. It
delivers on all key requirements: end-to-end type safety, AI-first architecture,
exceptional DX, and performance targets. The stack is production-ready,
cost-effective, and future-proof, with clear migration paths if needed.

**Status**: ✅ Architecture spike validated. Ready to proceed with Sprint 1
implementation.

```

### 📄 apps/api/src/trpc.ts (truncated: 120/620 lines)

**SHA256:** `d751d6fa34e2ad639a9a2b19b4e5cbbfbb7cc82ffbd8904de4d76a5e2a92077c`

```
/**
 * tRPC Configuration
 *
 * This file exports reusable tRPC utilities for creating type-safe API endpoints:
 * - createTRPCRouter: Function to create new routers
 * - publicProcedure: Procedure builder for public endpoints
 * - protectedProcedure: Procedure builder requiring authentication
 * - adminProcedure: Procedure builder for admin-only endpoints
 *
 * This is the recommended way to create tRPC routers in IntelliFlow CRM.
 * It ensures consistent patterns across all API modules.
 */

import { initTRPC, TRPCError } from '@trpc/server';
import { Context } from './context';
import { ZodError } from 'zod';
import { tracingMiddleware } from './tracing/middleware';
import { createDistributedRateLimitMiddleware, RATE_LIMIT_TIERS } from './middleware/rate-limit';
import { createTenantScopedPrisma } from './security/tenant-context';
import { runWithLogContext } from '@intelliflow/observability';
import {
  authenticatePartner,
  isPlatformAdmin,
  type PartnerContext,
  type PartnerScope,
} from './security/partner-auth';
import { isQuotaExceeded } from './shared/quota-guard';
import { membershipError, reasonFromCause } from './security/membership';
import { homeOnlyViolation } from './security/home-only';

/**
 * Initialize tRPC with context type
 *
 * Configuration:
 * - Context type inferred from createContext function
 * - Custom error formatter for Zod validation errors
 * - Structured error responses with zodError details
 */
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
        // Per-tenant metering: lets the UI tell "quota reached" apart from other preconditions.
        quota: isQuotaExceeded(error.cause)
          ? {
              code: error.cause.code,
              key: error.cause.key,
              used: error.cause.used,
              limit: error.cause.limit,
            }
          : null,
        // ADR-071: machine-readable reason (`ASSERTION_INVALID`, `NOT_A_MEMBER`, ...), copied from
        // `error.cause.reason`. The same reason is the message prefix `<REASON>: <text>`.
        reason: reasonFromCause(error.cause),
      },
    };
  },
[... 500 lines omitted ...]
 * Required for mutations that change tenant-wide configuration (e.g. registering
 * custom workflow node types, custom action handlers, RBAC policies).
 *
 * Chain order matters: isAuthed → isAdmin → tenantMiddleware so the admin check
 * runs BEFORE we spin up the tenant-scoped Prisma client.
 */
export const adminTenantProcedure = t.procedure
  .use(isAuthed)
  .use(isAdmin)
  .use(tenantMiddleware)
  .use(tracingMiddleware);

/**
 * Auth procedure - applies strict rate limiting for auth endpoints (5 req/min)
 *
 * Use this for all unauthenticated auth endpoints to prevent brute-force attacks:
 * - login / signup
 * - forgotPassword / resetPassword
 *
 * Applies the AUTH tier: 5 requests per minute per IP/user key.
 *
 * @example
 * authProcedure
 *   .input(loginSchema)
 *   .mutation(({ input }) => { ... })
 */
const _authRateLimitFn = createDistributedRateLimitMiddleware(RATE_LIMIT_TIERS.AUTH, {
  fallback: 'in-memory',
});
const authRateLimitMiddleware = t.middleware(async (opts) => {
  return _authRateLimitFn({ ctx: opts.ctx, next: opts.next });
});

export const authProcedure = t.procedure.use(tracingMiddleware).use(authRateLimitMiddleware);

/**
 * Re-export router for backward compatibility
 *
 * @deprecated Use createTRPCRouter instead
 */
export const router = t.router;

/**
 * Type-safe procedure builders summary:
 *
 * - publicProcedure: No authentication required
 * - protectedProcedure: Requires authenticated user
 * - tenantProcedure: Requires auth + enforces tenant isolation (USE THIS FOR TENANT DATA)
 * - adminProcedure: Requires admin role
 * - loggedProcedure: Public with performance logging
 *
 * Best practices:
 * 1. Always use Zod schemas for input validation
 * 2. Use tenantProcedure for all tenant-scoped resources (leads, contacts, etc.)
 * 3. Include proper error handling (TRPCError)
 * 4. Use TypeScript for end-to-end type safety
 * 5. Document complex procedures with JSDoc comments
 * 6. Keep procedures focused (single responsibility)
 */

```

---

*This context pack was auto-generated for agent context acknowledgement.*