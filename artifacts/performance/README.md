# Performance (Sprint 0)

This directory tracks Sprint 0 performance artifacts for **ENV-014-AI**.

## What exists in Sprint 0

- Baseline budgets: `infra/monitoring/performance-budgets.json`
- Lighthouse config: `lighthouserc.js` and `tools/perf/lighthouse.config.js`
- Benchmark harness: `tools/perf/benchmark.ts`

## Artifacts

- `artifacts/misc/profiling-results.json`: profiling output placeholder (replace with real runs).
- `artifacts/logs/optimization-log.csv`: optimization decisions log.
- `artifacts/misc/cache-config.yaml`: baseline caching configuration placeholder.

## Suggested workflow (operator)

```bash
pnpm install
pnpm run build
pnpm -w exec tsx tools/perf/benchmark.ts
```

Then commit updated performance artifacts and keep the optimization log current.

