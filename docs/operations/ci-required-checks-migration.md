# CI Required-Status-Checks Migration (CI Audit rewrite)

**Date:** 2026-06-03 · **Owner:** repo admin · **Refs:** ADR-057, ADR-058,
ADR-060, `docs/operations/ci-audit-report-2026-06-03.md`

Branch protection lives **outside** the repo and is **not** changed by merging
the workflow files. After the CI Audit rewrite (sharded `test-regression.yml`,
removal of duplicate jobs, Sonar folded into the pipeline), three required
status-check **contexts become orphaned** and must be replaced, or PRs to `main`
will block on checks that will never report again.

> ⚠️ Do the **Confirm** step on a live PR first. GitHub renders
> reusable-workflow check-run names as
> `<caller-job-name> / <reusable-job-name>`, and the exact string must match the
> branch-protection entry verbatim.

## Contexts removed (now orphaned)

| Old required context                    | Why it's gone                                                       |
| --------------------------------------- | ------------------------------------------------------------------- |
| `CI Pipeline / Unit Tests`              | `test` job is now a reusable-workflow call (sharded)                |
| `PR Checks / Test Coverage`             | duplicate full run removed (F-01)                                   |
| `PR Checks / Build Preview`             | duplicate build removed (F-05)                                      |
| `SonarCloud Analysis / SonarCloud Scan` | `sonar.yml` deleted; Sonar folded into `test-regression.yml` (F-04) |

## Contexts to require after the rewrite

| New required context                         | Source                                          |
| -------------------------------------------- | ----------------------------------------------- |
| `CI Pipeline / Lint & Format`                | ci.yml `lint`                                   |
| `CI Pipeline / Type Check`                   | ci.yml `typecheck`                              |
| `Unit Tests (sharded) / Merge Coverage Gate` | reusable `merge` job — the 90/80/90/90 gate     |
| `Unit Tests (sharded) / SonarCloud Scan`     | reusable `sonar` job (blocking, Quality Gate A) |
| `CI Pipeline / Build`                        | ci.yml `build`                                  |
| `CI Pipeline / Integration Tests`            | ci.yml `integration`                            |
| `Security Scanning / *` (existing)           | security.yml — unchanged                        |
| `Secret Scanning / *` (existing)             | secret-scan.yml — unchanged                     |

> The 20 individual `Unit Shard N/20` runs do **not** need to be required — the
> `Merge Coverage Gate` job `needs:` all of them, so it only succeeds when every
> shard passed.

## Step 1 — Confirm the real check-run names

```bash
# Open a throwaway PR (or use this branch's PR) and read the exact names:
gh pr checks <PR_NUMBER> --repo talyssonoliver/IntelliFlow-CRM
# Copy the names verbatim — especially the two reusable-workflow ones.
```

## Step 2 — Inspect the current required set

```bash
gh api repos/talyssonoliver/IntelliFlow-CRM/branches/main/protection/required_status_checks \
  --jq '{strict: .strict, contexts: .contexts}'
```

## Step 3 — PATCH the required contexts

Edit `contexts` to the confirmed names, then:

```bash
cat > /tmp/required-checks.json <<'JSON'
{
  "strict": true,
  "contexts": [
    "CI Pipeline / Lint & Format",
    "CI Pipeline / Type Check",
    "Unit Tests (sharded) / Merge Coverage Gate",
    "Unit Tests (sharded) / SonarCloud Scan",
    "CI Pipeline / Build",
    "CI Pipeline / Integration Tests",
    "Secret Scanning / Secret Scanning with GitLeaks"
  ]
}
JSON

gh api -X PATCH \
  repos/talyssonoliver/IntelliFlow-CRM/branches/main/protection/required_status_checks \
  --input /tmp/required-checks.json
```

## Step 4 — Verify

```bash
gh api repos/talyssonoliver/IntelliFlow-CRM/branches/main/protection/required_status_checks \
  --jq '.contexts'
```

Open a PR and confirm every required context reports a conclusion (no
`expected`/`pending` that never resolves).

## Rollback

Re-PATCH with the original `contexts` list captured in **Step 2** (keep that
JSON). To roll the workflows back too, revert the CI-rewrite PR — the old
`CI Pipeline / Unit Tests`, `PR Checks / Test Coverage`,
`PR Checks / Build Preview`, and `SonarCloud Analysis / SonarCloud Scan`
contexts return.
