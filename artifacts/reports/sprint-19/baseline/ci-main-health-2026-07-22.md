# CI Health — `main` — 2026-07-22

**Audited from worktree at `origin/main` = `d12093fa2`** (#603 R02 merge, the latest ENG-OPS-002 merge).
Scope: recent `push`-triggered workflow runs on `main` after PRs #599–#603 landed.

## Summary

| Workflow | Latest conclusion | Classification |
|---|---|---|
| CI Pipeline | ❌ **failure** | PRE_EXISTING (E2E test-discovery) |
| Security Scanning | ✅ success | — (audit gate recovered) |
| Secret Scanning | ✅ success | — |
| Runtime Path Linting | ✅ success | — |
| Artifact Path Linting | ✅ success | — |
| Supply Chain Security — SBOM | ✅ success | — |
| Artifact Signing and Provenance | ✅ success | — |
| Validate Sprint Data / Governance | ✅ success | — |
| Build & Push Images | ✅ success | — |
| Release | ✅ success | — |
| CD / Deploy Preview / Deploy Workers | ⏭️ skipped | gated (workflow_run/env) |

**Only one red workflow on `main`: CI Pipeline, and within it a single failing job — `E2E Tests`.**

## Red job detail

### CI Pipeline → E2E Tests — PRE_EXISTING (INFRA / test-discovery)
- **Run:** [29925134514](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/29925134514) (push, 2026-07-22 13:42Z) · job `88941668002`
- **Root cause (verbatim):**
  ```
  Run pnpm exec playwright test --project=chromium tests/e2e/smoke.spec.ts
  Starting Playwright Global Setup...
  Error: No tests found.
  ##[error]Process completed with exit code 1.
  ```
- **Diagnosis:** Playwright global setup runs, but `tests/e2e/smoke.spec.ts` resolves to **zero discovered tests** → exit 1. This is a test-discovery / build-artifact-handoff problem in the E2E lane, not a product regression.
- **Classification: PRE_EXISTING.** `CI Pipeline` has failed on **every** push for weeks (history below), long predating #599–#603. The E2E lane is chronically red on this same signature.
- **NOT caused by the ENG-OPS-002 merges** (#601 R03, #602 R01-SEC, #603 R02-QUAL): those are backend code/test fixes (dedup threshold, security, quality) with no touch to Playwright config or E2E test discovery.

## Failure history (context for "chronic")

`CI Pipeline` push runs, most recent first — all failure:
`29925134514` (13:42Z), `29921210529` (12:49Z), `29897238690` (06:35Z), `29895616625` (06:04Z), `29891289989` (04:31Z), `29888630805` (03:30Z) …

Also intermittently red (separate lanes, not this task's scope):
- `Dependency Security Scan` (06:35Z, 03:30Z) — audit gate; **now recovered** (`Security Scanning` latest = success).
- `Release` (04:32Z) — one-off.
- `E2E Full Suite` (04:07Z, `schedule`) — nightly E2E, same discovery issue.

## Classification tally

| Class | Workflows/jobs |
|---|---|
| CAUSED_BY_RECENT_MERGE (#601/#602/#603) | **none** |
| PRE_EXISTING | CI Pipeline → E2E Tests (chronic "No tests found") |
| FLAKE | none observed this window |
| INFRA | E2E test-discovery / artifact handoff (overlaps PRE_EXISTING) |

## Bottom line

`main` is green on every required gate **except** the chronically-red `E2E Tests` job in CI Pipeline — a pre-existing test-discovery/infra failure unrelated to the ENG-OPS-002 remediation merges. No new breakage attributable to #599–#603.
