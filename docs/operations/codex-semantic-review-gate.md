# Codex Semantic Review Gate

**Added:** 2026-06-11 **Owner:** DevOps Lead / Tech Lead **Status:** Active

---

## What it is

An independent LLM-powered code-review pass that runs on every diff locally via
pre-push. The codex CLI is installed globally and authenticated via OAuth
(ChatGPT/Codex login) on the developer's machine. No API key is required.

> **Claude fallback (added 2026-06-15).** When codex is unavailable, unauthed,
> or hits its **OpenAI usage/tier cap** (which returns an error instead of
> findings), the gate now FALLS BACK to the Claude Code CLI (`claude -p`) on the
> **same** review prompt, schema, fingerprint and waiver logic — so a fallback
> review blocks/passes exactly as codex would. Previously a capped codex
> degraded to `SKIPPED_PRECONDITION` (a silent pass), which let unreviewed code
> merge during the cap window (e.g. IFC-287/IFC-266 on 2026-06-14). The gate now
> skips only when **neither** codex nor `claude` is usable. Force the fallback
> with `CODEX_REVIEW_FORCE_FALLBACK=1`. A Claude review costs ~$0.25–0.30 and
> runs once per committed SHA (pre-ship caches the step).

Unlike TypeScript, ESLint, and SonarQube — which all operate on the code the
author wrote and tests the author provided — this gate drives an **independent**
Codex review that is not anchored to the author's assumptions. Its target: the
bug class where the author's tests are green but the logic is wrong because both
the code and the tests encode the same incorrect assumption.

Real example that motivated this gate: a revenue-band string (`"1M-10M"`) was
mapped to 100 cents. The tests asserted 100; the code returned 100. TypeScript
typed it as `number`. ESLint had no complaint. Sonar had no complaint. Every
gate was green. The business value was wrong by a factor of 10,000.

## Scope

The gate reviews files changed in the diff vs `origin/main`, filtered to paths
inside `sonar.sources` (as defined in `sonar-project.properties`). Tests are
**in scope** because buggy tests are the problem.

Excluded: docs, lockfiles, generated files, `infra/`, `scripts/`, `tools/`,
`*.config.{js,ts}`, `dist/`, `artifacts/`, migrations.

## Trigger points

| Where          | Trigger                            | Consequence                                                         |
| -------------- | ---------------------------------- | ------------------------------------------------------------------- |
| Local pre-push | `pre-ship.mjs` step `codex-review` | Degrades to SKIPPED if codex absent or not logged in; required:true |

**There is NO CI enforcement.** CI runners do not have the codex OAuth session.
The gate runs local-only where the authenticated codex CLI lives.

## Confirming codex is authenticated

```
codex login status
# Expected output: "Logged in using ChatGPT"
```

If not logged in:

```
codex login
# Follow the browser OAuth flow (ChatGPT/Codex account)
```

No OPENAI_API_KEY is needed. The gate uses the OAuth session only.

## Headless invocation

The engine (`scripts/codex-review.mjs`) runs:

```
codex review --base <base-ref> "<structured prompt requesting JSON {findings:[...]}"
```

It computes stable fingerprints, filters waivers, writes artifacts, and exits
0/1.

## Agent usage

Sub-agents running in worktrees on this machine run the gate before committing:

```
node scripts/codex-review.mjs
```

The agent's LOCAL OAuth codex session is used. Fix or waive all findings before
committing. Do not push until the gate exits 0.

## Waiver flow

Waivers live in `tools/audit/codex-review-waivers.yaml`.

Required fields per entry:

| Field         | Requirement                                                         |
| ------------- | ------------------------------------------------------------------- |
| `fingerprint` | SHA-256 hex of `<file>:<normalised-issue-text>`                     |
| `reason`      | Non-empty. Vague reasons ("known issue") are grounds for reverting. |
| `author`      | GitHub handle of approver                                           |
| `date`        | ISO-8601                                                            |
| `expires`     | Optional — gate re-blocks after this date                           |

To add a waiver:

1. Run `node scripts/codex-review.mjs` and copy the fingerprint from the summary
   output.
2. Add an entry to `tools/audit/codex-review-waivers.yaml` with a concrete
   reason explaining why the finding is a false-positive or an accepted risk.
3. Run the gate again to confirm it exits 0.
4. Include the waiver change in the same PR as the code it covers (co-dependent
   changes ride the feature branch).

## False-positive policy

Codex is an LLM. It will produce false positives. The policy:

- A false-positive is one where the code is correct and the finding is wrong.
- Add a waiver with `reason` explaining the correct behaviour.
- Do NOT add a waiver for a finding that is partially correct ("the code is
  technically wrong but we'll fix it later"). File a `gh issue` instead and fix
  it in a follow-up PR.

## Artifacts

| Path                                   | Description                          |
| -------------------------------------- | ------------------------------------ |
| `artifacts/codex-review/findings.json` | Raw structured findings with verdict |
| `artifacts/codex-review/summary.txt`   | Human-readable summary               |
| `artifacts/codex-review/codex-raw.txt` | Raw Codex stdout for debugging       |

## Debt ledger note

This gate was added as a systemic response to the revenue-band unit-mapping bug
that passed all prior gates. Tracked in `artifacts/metrics/debt-ledger.yaml` as
`GATE-CODEX-001`.
