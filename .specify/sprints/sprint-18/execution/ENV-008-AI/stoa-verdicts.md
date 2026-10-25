# ENV-008-AI: STOA verdicts (MATOP, run env-008-ai-exec-20261025)

On 2026-10-25, four STOA subagents ran in parallel (Agent tool: `stoa-foundation`, `stoa-security`, `stoa-quality` and `stoa-automation`), against branch `feat/env-008-ai-env008` at `5162ed721`. They read the logged evidence in this folder and ran static checks only (no test or build processes, because other lanes share the machine). The verdicts below are their own.

| STOA | Verdict | Basis |
|---|---|---|
| Foundation | **PASS** | typecheck, build, lint, lint-format and nf002 logs exit 0; diff coverage 92.0%; the four workflows parse and pin `@v7`; the `.d.mts` files match their `.mjs` exports; `otel-config.yaml` keeps its collector keys; artifact-path lint is clean; validate-artifacts misses only the attestation, which is written later |
| Automation | **PASS** | path filters isolate each Grafana resource; sparse checkouts hold every runtime import; no schedule trigger; four distinct concurrency groups; the 12-minute timeouts cover the 255 s retry; push runs apply and fail visibly; the CSV diff against the merge base is row ENV-008-AI only; the ledger parses with every required field. WARN-level note: Railway GraphQL calls had no fetch timeout |
| Quality | **WARN** | every plan Step 6 probe-guard case has a real assertion; no time bombs; diff coverage honest (92.0%, no ignore pragmas); the RED log is genuine. Warnings: (1) a few loops lacked non-empty guards and the burn-rate blocks were only `toBeDefined()`; (2) the repo-wide 90% global threshold is not met for the six tooling files in scope (functions 89.28%, branches 81.26%), although the spec's gate (NF-003, 80% on changed lines) is met; (3) the test logs predated commit `3f799b94f` |
| Security | **FAIL** | the only blocking item is `pnpm audit --prod`: 17 advisories, 4 critical. The diff changes no `package.json` or lockfile, so the advisories are inherited from the branch's merge base `e7ce625b2`. Everything specific to the change held: secrets only in step env, `contents: read`, no `pull_request*` trigger, a token-less, non-redirecting probe, no deploy path, fail-closed behaviour, no leaks in logs or the summary, gitleaks (7 commits) and workflow-secret-lint clean. MEDIUM: account-scoped `RAILWAY_TOKEN` (#1031); Production environment branch policy unverified. LOW: `redactBody` gaps (Basic, short prefixed tokens); Railway error code not allow-listed; actions pinned by tag |

**Aggregate (MATOP rule: any FAIL → FAIL): FAIL**, caused by the inherited `pnpm audit` findings alone.

## Disposition

- **pnpm audit (Security FAIL).** `pnpm audit --audit-level=critical` and `--prod --audit-level=critical` both exit 1 on this branch (`pnpm-audit.txt`). The four critical advisories (next, @sentry/nextjs, dompurify) are fixed on main by #1008 (`d8bf93c40`), after this branch's merge base. #1016 tracks the remaining highs. `Security Scanning` is also failing on main itself (runs `40209168969` and `40204881383`). This task changes no dependency (NF-002). The audit must be re-run after origin/main is merged in (the merge waits for the lane lead), and the verdict re-evaluated then.
- **Production environment branch policy (Security MEDIUM, unverified).** Verified by the lead: `gh api …/environments/Production` returns `deployment_branch_policy: null` and `protection_rules: []`. Tracked as #1032, `ENV008-PROD-ENV-BRANCH-POLICY-001`, and in the findings doc as T6. Fixing it is an owner-only GitHub settings change.
- **RAILWAY_TOKEN scope (Security MEDIUM).** Already tracked as #1031, and the workflow header names it.
- **Fixed in this task after review:**
  - `redactBody` now also redacts `Basic` credentials and short prefixed tokens.
  - The Railway error code is printed only if it matches `^[A-Z_]{1,40}$`.
  - Railway GraphQL calls have a 30 s timeout.
  - The three new workflows set `persist-credentials: false`.
  - The Quality test gaps are closed: non-empty guards, the burn-rate labels and annotations pinned, and `validateConfig` cases for a bad query type and an empty metric.
  - Each fix has a test that failed first.
- **Quality: global 90% threshold.** Not a gate for this task. NF-003 and the repo's diff-coverage gate (which mirrors Sonar `new_coverage`) are the gates, and both pass. The uncovered remainder is the CLI guards (the NF-003 deviation) and defensive branches.
- **Quality: stale logs.** All task, regression and root runs, and the test-file tsc, are re-run at the final HEAD before the attestation.
- **Actions pinned by tag (Security LOW).** Left as is: all 108 checkouts in the repo use `@v7` tags. Changing that is a repository-wide decision, not one for this task.

## Independent code review (stand-in for the codex gate)

`scripts/codex-review.mjs` reported "0 files in scope". Its `EXCLUDE_PATTERNS` drop `tools/` and `infra/`, so its PASS covers none of this task's code (`codex-review-1.txt`). A direct Codex review hit the account's usage limit and did not run. A fresh Claude subagent (general-purpose, given the diff and the spec, not the lead's conclusions) reviewed the working tree against origin/main on 2026-10-25. It found no high-severity problems. Its findings and their dispositions:

1. **Medium, `apply-grafana-slos.mjs`:** if Grafana stores a POSTed SLO under its own uuid, every run would create a duplicate and stay green.
   - Fixed: a create whose response names a different uuid now fails the run, with a test.
   - Residual: if the API returns no uuid at all, only the post-merge `dry_run=true` dispatch, which should report all three uuids `present`, can prove it. That is listed as NEEDS_HUMAN.
2. **Medium, `apply-railway-self-healing.mjs`:** a 200 from the public URL may not prove Railway's own deploy check passes. Railway probes the container with Host `healthcheck.railway.app`.
   - Checked in code: `apps/api/src/http-server.ts:476-498` serves `/api/health/live` before any router, with no Host check. CORS only adds headers, and OPTIONS is the only short-circuit.
   - So the same 200 is returned whatever the Host. No change needed.
3. **Low, `apply-grafana-slos.mjs`:** `validateConfig` accepted a missing `folderUid` or `destinationDatasourceUid`, or an empty `slos` list. Fixed, with a test.
4. **Low, `apply-grafana-dashboard.mjs`:** panels nested in a row were not checked, and a `peer_service` label could be read as the service matcher. Fixed (recursion plus `(?<!\w)`), with tests.
5. **Note:** the branch is behind origin/main. The diff shows main-only changes (combined-worker workflow edits, the `ifc074-error-spans-direct` rule) as reverts. They come in when origin/main is merged at ship, after the lane lead clears the merge; `alert-rules.json` is not edited by this task.
6. **Note:** the GitHub Actions expressions were traced by hand and are correct: `--apply` on push and only on a ticked dispatch, and no `--dry-run` on push.
