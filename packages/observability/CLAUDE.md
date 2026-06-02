# packages/observability - Tracing, Metrics, Logging

## Purpose

`@intelliflow/observability` centralizes OpenTelemetry distributed tracing,
metrics, and structured logging (Pino) for the whole system. Built on the OTel
SDK (`sdk-node`, trace + metrics exporters over OTLP/gRPC) plus `pino`.

## Entry Points (barrel: `src/index.ts`)

- `initObservability(config)` - bootstrap tracing/metrics/logging; call once at
  process start, BEFORE other imports that need instrumentation.
- `shutdownObservability()` - flush + graceful teardown; call on shutdown.
- `runWithLogContext` / `getCurrentLogContext` (+ `LogRequestContext`) - bind
  correlation IDs across async boundaries.
- Re-exports OTel SDK trace primitives for in-process span capture (IFC-032).

## Code Map

| File                       | Role                                  |
| -------------------------- | ------------------------------------- |
| `tracer.ts` / `tracing.ts` | Tracer setup + span helpers           |
| `metrics.ts`               | Business + system metrics             |
| `logging.ts`               | Pino structured logger                |
| `log-context.ts`           | AsyncLocalStorage correlation context |

## Pitfalls

- `initObservability` must run before instrumented modules load, or
  auto-instrumentation misses them.
- Always pair init with `shutdownObservability` in workers/long-lived processes
  or spans/metrics are lost on exit (no flush).
- Logging correlation only works inside `runWithLogContext` - outside it,
  `getCurrentLogContext` is empty.
