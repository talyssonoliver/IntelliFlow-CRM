# apps/workers - Background Worker Runtime

## Purpose

Meta-package (`@intelliflow/workers`) that groups the standalone background
worker processes. It builds/runs nothing itself — `build` is a no-op echo and
`dev`/`typecheck`/`lint` fan out to the sub-workers via `pnpm --filter`. The
sub-workers are built by root Turbo.

**#230:** `notifications-worker/` was removed. Its
`intelliflow-notifications-email` queue consumer now lives in `apps/ai-worker`
(`src/workers/notification-email-worker.ts`). `events-worker/` (outbox
dispatch + scheduled maintenance) stays here; folding it into ai-worker is
tracked separately.

## Sub-workers (each its own package + `src/main.ts` entry)

| Worker              | Package                         | Responsibility                                                                                           |
| ------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `events-worker/`    | `@intelliflow/events-worker`    | Outbox dispatch + subscription bridge + scheduled maintenance jobs                                       |
| `ingestion-worker/` | `@intelliflow/ingestion-worker` | Document/text ingestion jobs (`jobs/extractText.job.ts`)                                                 |
| `combined-worker/`  | `@intelliflow/combined-worker`  | Runs ai-worker + events-worker + ingestion-worker in ONE process: one health endpoint, one shutdown path |
| `shared/`           | (shared lib)                    | Cross-worker runtime: `base-worker.ts`, `graceful-shutdown.ts`, `health-server.ts`, `queue-connector.ts` |

## Entry Points

- Each worker: `src/main.ts` (long-running process).
- Outbox pattern (events-worker): `outbox/pollOutbox.ts` +
  `outbox/event-dispatcher.ts`.

## Patterns

- New workers extend `shared/src/base-worker.ts` and reuse `graceful-shutdown`,
  `health-server`, and `queue-connector` rather than re-implementing lifecycle.
- Queue transport is BullMQ (see `packages/platform` queues primitives).

## Combined worker

`combined-worker/` imports the existing worker instances (`AIWorker`,
`eventsWorker`, `ingestionWorker`) and starts them in one process so production
can run a single Railway service. Each worker still runs alone via its own
`main`. Rules it enforces: per-worker health servers move to `HEALTH_PORT=0` and
only the combined server (`COMBINED_HEALTH_PORT` > `HEALTH_PORT` > `PORT`,
default 3100) listens on the real port; the workers' own SIGINT/SIGTERM handlers
are removed after start and replaced by one that stops all three, then exits. A
worker that fails to start aborts the process (exit 1) unless
`COMBINED_ALLOW_PARTIAL=true`. `COMBINED_WORKERS` selects a subset.
`COMBINED_BACKGROUND_JOBS=on` also runs the api's timer jobs (approval sweep,
email bounce scan) from `apps/api/src/background-jobs.ts`; pair it with
`API_BACKGROUND_JOBS=off` on the api service so an idle api makes no outbound
traffic and Railway can sleep it (running them in both is safe: advisory lock /
mailbox lease). Image: `combined-worker/Dockerfile`, published as
`intelliflow-crm-combined-worker`.

## Pitfalls

- Running `pnpm --filter @intelliflow/workers build` does nothing — build the
  individual sub-workers (root `turbo run build`), or you'll ship stale `dist`.
- These are processes, not request handlers — wire health/shutdown or they hang
  on deploy rollover.
