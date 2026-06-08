# Local ↔ CI Gate Parity — Audit & Prevention (2026-06-08)

## Why this exists

A recurring class of pull requests went **green locally and red in CI** (#340,
#346), plus a backlog of chronic reds and bot-PR noise. Auditing them surfaced a
single meta-pattern worth fixing at the system level, not just per-instance:

> **Local gates (husky hooks + `scripts/pre-ship.mjs`) were a weaker subset of —
> or a hand-rolled re-implementation that had drifted from — the CI
> required-check graph (`system-audit` Tier 1 + Tier 2).**

When the local gate is weaker than CI, "pre-ship passed" gives false confidence:
the failure only appears after a ~10–20 min CI round, on a PR that's already
open. The fix is **parity** — make each local gate run the _same_ check CI runs,
from a single source of truth.

## Failure classes → root cause → prevention

| #   | Class                                                    | Root cause                                                                                                                                                                                                                                                                  | Prevention                                                                                                                                                                                                                                                                                                           | Status                    |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | **Commit-message reds** (commitlint)                     | THREE validators disagreed: `.husky/commit-msg` (regex — checked subject _length_ not _case_), `pre-ship` (no message lint at all), CI `commit_msg_lint.py` (full ruleset). An upper-case subject `feat(ai-worker): OpenRouter…` (#340) passed both local gates, red in CI. | Route hook + pre-ship + CI through **one** linter: `commit_msg_lint.py` gains `--message-file` (hook) and `--base-ref` (pre-ship) modes; the hook delegates to it; pre-ship runs it over `origin/main..HEAD`.                                                                                                        | **FIXED — #348**          |
| 2   | **Squash-subject reds** (#227, recurring #58/#118/#221)  | The squash subject is built from the **PR title** at merge time — no local or PR gate validated it against the commitlint subject rules.                                                                                                                                    | `pr-checks.yml` `Validate PR title`: add `subjectPattern: ^(?![A-Z]).+$` (no upper-case start) + a ≤100 title-length check — mirrors `commit_msg_lint` for the title.                                                                                                                                                | **FIXED — this PR**       |
| 3   | **Other `system-audit` Tier-1 not mirrored in pre-ship** | `semgrep-security-audit` (#346) and `eslint-max-warnings-0 --reportUnusedDisableDirectives` (#276, #310) run only in CI. pre-ship's `lint` step is per-package `turbo lint`, which does not catch root-level max-warnings / unused-disable-directives.                      | Add an `eslint-max-warnings` mirror step to pre-ship; run `semgrep` advisory-locally (heavy on Windows → SKIP-if-missing, like terraform/actionlint).                                                                                                                                                                | **PLANNED — #67 + issue** |
| 4   | **Bot-PR spam** (9 open governance-metrics PRs)          | A workflow opens a PR on **every** metrics artifact change.                                                                                                                                                                                                                 | `governance-metrics.yml` → weekly schedule + auto-merge. (#306 was the intended fix but is `CONFLICTING` and bundles unrelated terraform churn → land a fresh, governance-only PR and close the 9 + #306.)                                                                                                           | **PLANNED — #68**         |
| 5   | **Orphaned unmerged fixes, incl. security** (#245)       | Work committed to feature branches, never PR'd; nothing flags a `[security]`-labelled fix sitting unmerged. `f465a9de9` (IFC-156 + IFC-155) never reached `main`.                                                                                                           | Land the **live-impact** parts as a focused PR (IFC-155 DSAR atomicity — _confirmed still missing on `main`_; `document-indexer.ts`). The IFC-156 `packages/ai` part is **dormant** (package not imported by any deployed app) → lower priority. Add a scheduled report flagging `[security]` commits not in `main`. | **PLANNED — #69 + issue** |
| 6   | **Chronic non-blocking CI reds rot**                     | Reds that aren't _required_ checks get ignored and accumulate (`Migration ETL → Validate Transformation Rules` failing since 2026-05-10; #276 eslint; #278 E2E).                                                                                                            | Fix or make visible; a weekly "red workflows on `main`" alert so a non-required red can't silently persist.                                                                                                                                                                                                          | **PLANNED — #70**         |

## Principle

Every gate added to CI's required set should have a **local mirror** in pre-ship
(or a husky hook) that runs the _same command / same source of truth_. A local
re-implementation of a CI rule is a latent drift bug — prefer invoking the CI
script directly (as #348 does with `commit_msg_lint.py`) over re-coding the
rule.

## Verification discipline used here

Each prevention is validated the same way the gap was found: reproduce the CI
failure locally first (e.g. `commit_msg_lint.py --message-file` on #340's exact
subject), then confirm the new local gate catches it, then confirm a full
`pre-ship` run stays green.
