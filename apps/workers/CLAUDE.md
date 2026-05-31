# apps/workers - Background Worker Runtime

## Purpose

Meta-package (`@intelliflow/workers`) that groups the standalone background
worker processes. It builds/runs nothing itself — `build` is a no-op echo and
`dev`/`typecheck`/`lint` fan out to the sub-workers via `pnpm --filter`. The
sub-workers are built by root Turbo.

## Sub-workers (each its own package + `src/main.ts` entry)

| Worker                  | Package                             | Responsibility                                                                                           |
| ----------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `events-worker/`        | `@intelliflow/events-worker`        | Outbox dispatch + subscription bridge + scheduled maintenance jobs                                       |
| `ingestion-worker/`     | `@intelliflow/ingestion-worker`     | Document/text ingestion jobs (`jobs/extractText.job.ts`)                                                 |
| `notifications-worker/` | `@intelliflow/notifications-worker` | Multi-channel delivery: `channels/{email,sms,webhook}.ts`                                                |
| `shared/`               | (shared lib)                        | Cross-worker runtime: `base-worker.ts`, `graceful-shutdown.ts`, `health-server.ts`, `queue-connector.ts` |

## Entry Points

- Each worker: `src/main.ts` (long-running process).
- Outbox pattern (events-worker): `outbox/pollOutbox.ts` +
  `outbox/event-dispatcher.ts`.

## Patterns

- New workers extend `shared/src/base-worker.ts` and reuse `graceful-shutdown`,
  `health-server`, and `queue-connector` rather than re-implementing lifecycle.
- Queue transport is BullMQ (see `packages/platform` queues primitives).

## Pitfalls

- Running `pnpm --filter @intelliflow/workers build` does nothing — build the
  individual sub-workers (root `turbo run build`), or you'll ship stale `dist`.
- These are processes, not request handlers — wire health/shutdown or they hang
  on deploy rollover.
