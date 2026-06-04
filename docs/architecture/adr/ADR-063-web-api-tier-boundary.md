# ADR-063: Web/API Tier Boundary — Type Inference Only, No Runtime Container

**Status:** Accepted

**Date:** 2026-06-04

**Deciders:** Backend Architecture, Infrastructure

**Technical Story:** Incident defects D1/D6 —
`docs/operations/incident-forensics-2026-06-04.md`

## Context and Problem Statement

`apps/web` is deployed to Vercel (serverless). `apps/api` is deployed to Railway
(long-running Node process). They are different execution environments with
different available infrastructure.

`apps/web/src/app/api/trpc/[trpc]/route.ts` (added in commit `8f63c2306`,
2025-12-28) imports `createContext` and `appRouter` from `@intelliflow/api`.
Those symbols are re-exported from `apps/api/src/context.ts` and
`apps/api/src/router.ts`, which in turn import `apps/api/src/container.ts`.
`container.ts` constructs `QueueAIService`, `OllamaAIService`,
`LiteLLMAIService`, `RedisCacheAdapter`, and `RedisAIMonitoringStore` at
module-load time. All of these services require env vars that are only present
on the Railway `api` service:

| Service                  | Required env var   | Present on Vercel? |
| ------------------------ | ------------------ | ------------------ |
| `QueueAIService`         | `REDIS_HOST`       | No                 |
| `OllamaAIService`        | `OLLAMA_BASE_URL`  | No                 |
| `LiteLLMAIService`       | `LITELLM_BASE_URL` | No                 |
| `RedisCacheAdapter`      | `REDIS_HOST`       | No                 |
| `RedisAIMonitoringStore` | `REDIS_HOST`       | No                 |

When `requiredProdEnv('REDIS_HOST', ...)` was made strict in PR #231 (commit
`f536f96c9`, 2026-06-02), the Vercel web tier began returning HTTP 500 on every
route because the module-load of the container threw before any request handler
ran.

PR #251 (commit `33295c0c6`, 2026-06-04) patched the immediate symptom by making
`getBullMQConnectionOptions()` lazy. The architectural root cause — that
`apps/web` imports the full `apps/api` runtime DI container — was not resolved
by that PR. This ADR records the architectural contract and the guard added to
prevent the pattern from recurring or spreading.

## Decision Drivers

- Railway-only services (Redis, Ollama, LiteLLM, Temporal, OTel) must never be
  required at import time on the Vercel web tier.
- Adding any new worker-only service to `apps/api/src/container.ts` must not
  require changes to the web tier or its env var configuration.
- The architecture guard must be statically verifiable in CI without a running
  server.
- Type-safe tRPC access from web components to API procedures must remain
  possible.

## Considered Options

1. **Type-only constraint (this ADR)**: forbid runtime container imports from
   `apps/web`; allow `@intelliflow/api` for TypeScript type inference only.
   Guard via `.dependency-cruiser.cjs` rule + architecture Vitest test. The
   existing `/api/trpc` route-handler coupling is acknowledged as technical debt
   and scoped out of this PR (see below).

2. **Split `@intelliflow/api` package entrypoints**: create a
   `@intelliflow/api/types` entrypoint that exports only TypeScript types (no
   runtime container construction) and a `@intelliflow/api/runtime` entrypoint
   for the Railway API process. Refactor `apps/web` to use the types-only
   entrypoint.

3. **HTTP-only tRPC client from web to Railway API**: remove
   `apps/web/src/app/api/trpc/[trpc]/route.ts` entirely; the web tier calls the
   Railway API over HTTP for all tRPC procedures. All server-side rendering in
   `apps/web` that needs tRPC data uses the `api-client` package which makes
   HTTP calls.

## Decision Outcome

**Option 1** is adopted for this PR as an immediate static guard. Options 2 and
3 are the approved long-term solutions and must be completed before the
architectural debt in the existing route-handler is resolved.

### Constraints enforced by this ADR

#### Constraint 1 — no runtime container import from web

`apps/web/**` source files MUST NOT import:

- `apps/api/src/container` (the full DI container)
- `apps/api/src/services/AIMonitoringService`
- `apps/api/src/modules/ai-monitoring/ai-monitoring.redis-store`
- `apps/api/src/modules/home/home.cache`
- Any `packages/adapters/src/**Ollama**` or `**LiteLLM**` module
- `apps/api/src/services/queue` (QueueAIService)
- `packages/platform/src/queues/connection` (BullMQ connection helper)
- `bullmq` (the BullMQ package itself)

#### Constraint 2 — Railway-only env vars are never required on Vercel

The following env vars MUST NOT be `requiredProdEnv`-checked at module-load time
in any code path reachable from `apps/web`:

- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `OLLAMA_BASE_URL`, `OLLAMA_MODEL`
- `LITELLM_BASE_URL`, `LITELLM_MASTER_KEY`
- `TEMPORAL_ADDRESS`

#### Constraint 3 — allowed import from web

`apps/web` MAY import `@intelliflow/api` for TypeScript type inference
(`import type { AppRouter } from '@intelliflow/api'`). This does not construct
any runtime services.

The existing `apps/web/src/app/api/trpc/[trpc]/route.ts` and
`apps/web/src/lib/trpc-server.ts` import of `@intelliflow/api/context` and
`@intelliflow/api/router` is acknowledged architectural debt. It is excluded
from the static guard because removing it requires the larger Option 2/3
refactor. The guard is specifically scoped to block NEW direct imports of the
container and worker-only modules.

#### Approved long-term pattern

The target architecture for web-to-API data access:

```
apps/web (Vercel)
  └── packages/api-client (HTTP tRPC client)
        └── HTTP calls to Railway API service
              └── apps/api (Railway)
                    └── apps/api/src/container.ts (DI container, Railway-only)
```

Web components use `@intelliflow/api-client` for type-safe tRPC calls over HTTP.
Server components that need data at render time call `api-client` (not the
container). The Railway API process is the only deployment that constructs the
DI container.

### Positive Consequences

- Any PR that introduces a new direct container import from `apps/web` fails CI
  immediately via the architecture test and dependency-cruiser rule.
- Adding a new worker-only service to `container.ts` cannot silently break the
  web tier.
- The constraint is verifiable without a running server.

### Negative Consequences

- The existing `/api/trpc` route-handler coupling remains in place until Options
  2/3 are implemented. A future PR adding an eager env-var check inside
  `@intelliflow/api/context` or `@intelliflow/api/router` could still trigger a
  Vercel boot failure — the guard does not protect against that path.
- Two separate entrypoints (`@intelliflow/api/context` and
  `@intelliflow/api/router`) remain implicitly coupled to the container without
  a static type-level signal that they carry runtime infrastructure.

## Enforcement

### Layer 1: `.dependency-cruiser.cjs` rules

Two rules enforce this constraint statically:

- `no-web-imports-worker-only-modules` (added in PR #251): forbids direct
  imports of `apps/api/src/services/queue`,
  `packages/platform/src/queues/ connection`, Ollama/LiteLLM adapters, and
  `bullmq`.
- `no-web-imports-api-container` (added in this PR): forbids direct imports of
  `apps/api/src/container` and API-internal worker service modules from
  `apps/web`.

Run: `pnpm exec depcruise apps/web --config .dependency-cruiser.cjs`

### Layer 2: architecture Vitest tests

`tests/architecture/web-worker-boundary.test.ts` (extended in this PR) scans all
`apps/web/src/**/*.ts(x)` files and asserts no import statement matches the
forbidden patterns.

Run: `pnpm test:architecture`

Both layers are required CI checks on every PR (see ci.yml `architecture` job).

## Related Decisions

- [ADR-003: Type-Safe API Design](ADR-003-type-safe-api-design.md) — documents
  the tRPC type coupling between web and API; does not cover runtime container
  coupling.
- [ADR-010: Architecture Boundary Enforcement](ADR-010-architecture-boundary-enforcement.md)
  — establishes the `tests/architecture/` + dependency-cruiser enforcement
  pattern; scoped to `packages/*` layering, not `apps/web` → `apps/api`.
- [ADR-031: AI Pipeline Design](ADR-031-ai-pipeline-design.md) — documents Redis
  as a required infrastructure component for the AI pipeline on the Railway
  tier.
- [ADR-047: Hexagonal Architecture](ADR-047-hexagonal-architecture.md) —
  hexagonal architecture enforced for `packages/*`; does not address the
  apps-tier boundary.

## Implementation Notes

### Files changed in fix/web-api-tier-boundary

- `.dependency-cruiser.cjs`: adds `no-web-imports-api-container` rule
- `tests/architecture/web-worker-boundary.test.ts`: adds two new test `describe`
  blocks scanning for container and Ollama/LiteLLM imports
- `docs/architecture/adr/ADR-063-web-api-tier-boundary.md`: this document

### Validation Criteria

- [x] `pnpm exec depcruise apps/web --config .dependency-cruiser.cjs` exits 0
- [x] `pnpm test:architecture` exits 0 (all boundary tests pass)
- [x] No existing web source file imports any of the forbidden patterns
- [x] ADR document present at
      `docs/architecture/adr/ADR-063-web-api-tier-boundary.md`

### Rollback Plan

Remove the `no-web-imports-api-container` rule from `.dependency-cruiser.cjs`
and revert `tests/architecture/web-worker-boundary.test.ts` to the pre-PR state.
This re-exposes the architectural risk but does not break any running service.
