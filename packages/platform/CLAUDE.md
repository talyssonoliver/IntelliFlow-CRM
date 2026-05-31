# packages/platform - Platform Primitives

## Purpose

`@intelliflow/platform` provides infrastructure-agnostic platform primitives
(originally Sprint 0 scaffolding). Consumed by API, workers, and other packages.
Depends on `@intelliflow/domain`, `bullmq`, `@bull-board/{api,ui}`, `zod`.

## Code Map (barrel: `src/index.ts` re-exports all)

| Module           | Provides                                                           |
| ---------------- | ------------------------------------------------------------------ |
| `feature-flags/` | Minimal, deterministic typed flag evaluator — no external service  |
| `resilience/`    | Resilience primitives (retry/circuit-breaker style helpers)        |
| `queues/`        | BullMQ queue wiring + Bull Board UI integration                    |
| `workflow/`      | Workflow/step orchestration primitives                             |
| `realtime/`      | Realtime channel primitives (`realtime/__tests__` covers behavior) |

## Entry Points

- `src/index.ts` is the only public surface (`export * from './<module>'`).
  Import from `@intelliflow/platform`, never deep paths.

## Patterns

- Feature flags are intentionally deterministic (no network) so evaluation is
  testable and reproducible — keep that property when extending.

## Pitfalls

- Build before downstream use: consumers resolve from `dist/`
  (`pnpm --filter @intelliflow/platform build`) — stale dist surfaces as missing
  exports.
