# Audit Performance & Iteration (Affected Scope, Caching, Resume)

This document describes the **additive** performance improvements for the audit
system:

- affected-only execution for PRs
- safe caching (Turbo + pnpm + Sonar cache dir)
- resumable audit runs (`--resume`)
- optional parallel execution (`--concurrency`)

## Modes

`tools/audit/run_audit.py` supports mode presets:

- `--mode pr`: Tier 1 + Tier 2, default scope `affected`
- `--mode main`: Tier 1 + Tier 2, default scope `full`
- `--mode nightly`: Tier 1 + Tier 2 + Tier 3, default scope `full`
- `--mode release`: Tier 1 + Tier 3, default scope `full`

You can override scope explicitly:

```bash
python tools/audit/run_audit.py --mode pr --scope full
python tools/audit/run_audit.py --tier 1 --scope affected
```

## Affected scope

Affected calculation is based on:

- `git merge-base <base-ref> HEAD`
- `git diff --name-only <mergebase> HEAD`
- package mapping via `pnpm exec turbo ls --output json`

Outputs:

- `artifacts/reports/affected/affected-files.txt`
- `artifacts/reports/affected/affected-packages.json`
- `artifacts/reports/affected/affected-summary.md`

## Caching

### Turbo

- CI sets `TURBO_CACHE_DIR=.turbo` and caches `.turbo/`.
- For PRs from forks, remote cache is protected by setting
  `TURBO_REMOTE_CACHE_READ_ONLY=true` (and secrets are unavailable by default).

### pnpm

- CI uses `actions/setup-node` with `cache: pnpm` for the pnpm store.

### SonarQube

- CI caches `.sonar/cache` (best-effort).

## Resume

`--resume` reuses prior **passing** tool results when:

- commit SHA matches
- `audit-matrix.yml` SHA256 matches
- tool command matches

This is intended for quick reruns of flaky/non-deterministic tools or
interrupted jobs.

## Parallel execution

Use `--concurrency N` to run tools in parallel (default is `1` to preserve
predictable resource usage).

## Retries

Tools can define `retries` and `backoff_seconds` in `audit-matrix.yml` to retry
flaky commands; retries are recorded per-tool in the audit bundle summary.

## Cache bypass integrity run

The weekly integrity workflow disables remote cache and forces Turbo execution:

- `.github/workflows/system-audit-integrity.yml`
