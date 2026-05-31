# tools/scripts - Project Tooling & Automation

## Purpose

~113 standalone utility scripts (no `package.json` of its own) for sprint
tracking, attestation/governance, validation, CSV/metrics sync, audits, and CI
helpers. Scripts run from the repo root via `tsx` (`.ts`) or `node` (`.mjs`),
e.g. `tsx tools/scripts/sprint-validation.ts`,
`node tools/scripts/nplus1-scan.mjs`. Many are wired into root `package.json`
scripts, husky hooks, and CI.

## Subdirectories

| Dir                       | Role                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/`                    | Shared helpers (`contract-parser`, `context-pack-builder`, `column-deprecation`, `schema-paths`, `code-review/`, ...) imported by the top-level scripts                               |
| `exec-preflight/`         | MANDATORY `/exec` Phase 1 gate checks (`check-exec-readiness.mjs`, `check-page-doc-cochange.mjs`, `check-plan-reviewer-subagent.mjs`, `check-nav-wiring.mjs`, lighthouse checks, ...) |
| `gate-2/`                 | Gate-2 deliverable-path verification helpers                                                                                                                                          |
| `benchmarks/`, `k6/`      | Performance + load scripts                                                                                                                                                            |
| `worktree-pool/`          | Multi-agent worktree pool tooling                                                                                                                                                     |
| `observability/`          | Observability-related scripts                                                                                                                                                         |
| `fixtures/`, `__tests__/` | Test fixtures + Vitest tests for the scripts                                                                                                                                          |

## Conventions

- New scripts: see README "Adding New Scripts". Put reusable logic in `lib/` (it
  has its own tests) rather than duplicating across scripts.
- Sprint-plan tooling edits the CSV single source of truth -
  `split-sprint-plan.ts` regenerates the `Sprint_plan_*.csv` splits; never
  hand-edit derived files.

## Pitfalls

- These scripts assume CWD = repo root (relative paths to `apps/`, `docs/`,
  `artifacts/`). Run from root, not from `tools/scripts/`.
- Windows + inline node/CSV writes corrupt multi-line quoted cells - write a
  `.mjs` file and run it; never pipe inline JS through PowerShell `Set-Content`.
- exec-preflight `check-*.mjs` returning non-zero is a BLOCKER, not a warning.
