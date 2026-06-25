# ADR-067: Finish the Metrics-Harness De-Churn (Formatter Fix) and Stage the Canonical/Derived Split for Parallel-Agent Scale

**Status:** Accepted — Phase 0 + 1 shipped (PR #517); **Phase 2 implemented**
(branch `chore/metrics-phase2-generated-cache`): the entire per-task metrics
tree is now a generated, gitignored cache rebuilt from `Sprint_plan.csv` +
`.specify/.../task-tracking.json`, with no-loss proven by
`tools/scripts/prove-metrics-roundtrip.mjs` (0 operational drift across all
migrated tasks). Supersedes ADR-066.

**Date:** 2026-06-23

**Deciders:** talyssonoliver (owner), Claude Code

**Technical Story:** Sprint-18 metrics-harness retro. A 7-row status
reconciliation on `Sprint_plan.csv` produced a **398-file** working-tree diff,
despite ADR-066 Phase 1 claiming the sync was idempotent. Surfaced while
updating the tracker to reflect tasks shipped in PRs
#481/#484/#509/#514/#515/#516.

## Context and Problem Statement

The per-task metrics tree (`apps/project-tracker/docs/metrics/sprint-*/*.json` +
`_global` aggregates) is the **coordination substrate for the parallel-agent
fleet**: each agent runs `/loop "/full-pipeline <TASK-ID>"` in its own worktree,
branches, commits, and PRs, and the harness gates (Evidence Integrity, Metrics
Tracked State, Canonical Uniqueness) use this tree to prove completeness and
prevent duplicate work. A write-cascade on this tree is therefore not cosmetic —
it makes every agent's PR collide on the CSV + hundreds of JSONs (the Wave-3
#424/#425 collision class).

ADR-066 (2026-06-14) diagnosed the cascade and implemented **Phase 1** (de-churn
the writer: `writeJsonFile` skip-if-unchanged + stop re-stamping volatile
fields). It measured "480 → 0 no-op churn." **That measurement was wrong for the
real repo**, and three further problems were missed:

1. **The de-churn is defeated by a formatter mismatch (the actual root cause of
   the 398-file diff).** `writeJsonFile` emits `JSON.stringify(data, null, 2)`
   (multiline arrays). The pre-commit hook (`.husky/pre-commit`,
   `prettier --write` on staged `*.json`) reformats committed JSONs to
   prettier's **inline** short-array style. `writeJsonFile`'s skip-if-unchanged
   was a **byte** compare, so committed-inline `!==` writer-multiline → it
   rewrites **every file on every sync**. ADR-066's "0 churn" was measured on a
   temp copy that had been sync-written (already multiline), so it never saw the
   prettier'd committed state. Verified 2026-06-23: an _unchanged_ task
   (`sprint-9/IFC-145.json`) churned with only `["IFC-002","IFC-136"]` →
   multiline; `prettier --check` on the writer's output reports "Code style
   issues found."

2. **The per-task JSONs are MIXED canonical/derived, not "derived" as
   `apps/project-tracker/CLAUDE.md` claimed.** A 2026-06-23 audit (6-agent
   sweep) found **~233 of ~418 task JSONs carry sole-copy canonical content**
   absent from both the CSV and `.specify/`: `status_history`, `blockers`, real
   `validations` (exit codes + stdout hashes), `kpis.actual`/`met`,
   `execution.*` (executor, agents, retry_count, log_path, timings),
   `actual_duration_minutes`, plus **27 tasks with extra-schema fields** (10
   `waivers`, 10 `stoa_verdicts`, 5 `implements`, 1 `spec_sessions`, 1
   `context_verification`). The naive "gitignore the derived tree" — proposed in
   ADR-066 Option 2 and rejected there — would be **data loss**.

3. **Live data fabrication (violates the app's own anti-fabrication rule).**
   `task-json-updater.ts:applyCompletionTimestamps` fabricated
   `completed_at = now`, `started_at = now − 15min`,
   `actual_duration_minutes = target || 15` on any CSV flip to DONE (~199 tasks
   affected historically). `generateDefaultValidations` injected a fake
   `echo "Task X completed"` run (`exit_code 0, passed: true`) — schema-shaped,
   meaningless provenance (~61 tasks). A third site,
   `summary-generators.ts:201`, mints `completed_at = now` for CSV-completed
   tasks with no per-task JSON (~83 tasks).

## Decision Drivers

- One task-completion by a parallel agent must touch **O(1)** files, not O(n).
- **No loss of canonical evidence** — the 233 sole-copy task JSONs stay intact.
- **Gates keep protecting** completeness + anti-duplication; any aggregate that
  becomes generated must be re-validated by "regenerate + assert consistency,"
  not silently un-checked.
- **Low-blast-radius first.** Land the writer/format fix (which needs no surface
  or gate change) before any structural change.

## Decision Outcome

**Staged: Phase 0 lands now (this PR). Phase 1 and Phase 2 are designed here but
gated behind explicit prerequisites — they are NOT authorized to land by this
ADR alone.** This supersedes ADR-066's Phase-1-only completion claim and its
withdrawn Option 2.

### Phase 0 — De-churn + de-fabricate (THIS PR; low-risk, reversible)

1. **`writeJsonFile` (file-io.ts): format-insensitive compare.** Before writing,
   if the on-disk file parses to the same value
   (`JSON.stringify(JSON.parse( current)) === JSON.stringify(data)`), skip the
   write — regardless of whitespace/array formatting. This makes the sync
   genuinely idempotent against the prettier mismatch (the piece ADR-066
   missed). A real content change still writes.
2. **`.prettierignore`** the generated metrics JSONs (`sprint-*/**/*.json` + the
   four named `_global` aggregates) so the pre-commit hook stops re-inlining
   them. Mirrors the existing treatment of `SESSION_CONTEXT.md` /
   `CURRENT_STATE_REPORT.md`. Schemas (`docs/metrics/schemas/**`) are
   hand-authored and intentionally left prettier-managed.
3. **Remove the two active fabrication sites** in `task-json-updater.ts`
   (`applyCompletionTimestamps`, `generateDefaultValidations`). Sync no longer
   invents timing or validations; a CSV-only flip leaves those fields absent
   (honest "unknown"), and exec-metrics writes the real values at execution
   time.
4. **Correct `apps/project-tracker/CLAUDE.md`** — the per-task JSON is MIXED
   canonical/derived; sync **merges** CSV-derived fields over the file
   (preserving canonical fields), it does not rebuild from CSV.
   Deleting/restoring-from-CSV a task JSON destroys evidence.

`create-task`'s post-create full sync is **not** changed: after fix (1) a full
sync only writes files whose content actually changed (~7, not 480), so the
cascade is gone at the source. Removing the call is folded into Phase 1.

**Validation:** on a clean (prettier'd) tree with Phase 0 applied, `sync` run
twice yields **0 file diffs**; a single-row CSV status flip touches only that
task's JSON + the roll-ups whose counts changed (~10 files). The ADR-066
`de-churn.test.ts` stays green.

### Phase 1 — Gitignore the PURE aggregates + rewrite Gates 5/6 (GATED)

Only the **purely-derived aggregates** are gitignored —
`_global/Sprint_plan.json`, `task-registry.json`, `dependency-graph.json`,
`spec-tracker.json`, the split CSVs, and `sprint-N/_summary.json`. The per-task
`{TASK_ID}.json` files stay tracked (canonical). Generate the aggregates at
dev-start (predev hook), in CI (before validate-sprint-data), and on-demand.
Rewrite Gate 5 from "assert zero untracked" to "regenerate to temp + diff + FAIL
on drift"; rewrite Gate 6 to assert `Sprint_plan.csv` tracked-once AND the
gitignored aggregates are NOT tracked. **Co-dependent — must land atomically**
(gitignore + CI generate step + path-trigger change + gate rewrites in one PR).

### Phase 2 — Canonical per-task store in `.specify/` (GATED, HIGH-risk)

Introduce
`.specify/sprints/sprint-{N}/attestations/{TASK_ID}/task-tracking.json` as the
canonical home for the per-task operational fields, with a closed schema that
**must include the 27 tasks' extra-schema fields**. Migrate the 233 sole-copy
tasks into it (one-time script, run as a blocking pre-gitignore gate). Only then
can the per-task JSONs become fully derived and gitignored. This is a real
migration with its own rollout, not a follow-on.

> **Implemented** (branch `chore/metrics-phase2-generated-cache`):
>
> - Schema `docs/metrics/schemas/task-tracking.schema.json` (permissive
>   `additionalProperties:true` for no-loss; timestamp pattern accepts Z + the
>   historical `+00:00` offset so 139 legacy values validate unchanged).
> - `tools/scripts/migrate-task-tracking.mjs` extracted
>   full-copy-minus-CSV-owned content into **415** `task-tracking.json` files;
>   blocking checks: field-completeness, verbatim preservation, schema validity.
>   Duplicate-source collisions (e.g. IFC-300) merged canonical-wins.
> - `lib/data-sync/task-json-builder.ts` + `buildIndividualTaskFile` +
>   orchestrator `rebuildPerTask` rebuild each per-task JSON =
>   merge(CSV-derived + `task-tracking.json`), driven by task-tracking existence
>   (FLAT `sprint-{N}/<TASK>.json`, reproducible from `.specify` alone on a
>   fresh checkout).
> - No-loss gate `tools/scripts/prove-metrics-roundtrip.mjs`: **0 operational
>   drift**; the only diffs are CSV-derived corrections (18 stale statuses incl.
>   merged-but-BACKLOG tasks, 0 regressions). `generate:metrics` is idempotent.
> - Cutover: the whole `docs/metrics/sprint-*` JSON tree is gitignored +
>   `git rm --cached`; Gate 6 (`evaluatePerTaskTreeNotTracked`) asserts the tree
>   is not tracked. Gate 3 (Evidence Integrity) is unchanged — every DONE task
>   is covered by its tracked `.specify` attestation (0 DONE tasks lack one), so
>   its per-task-JSON fallback is vestigial. Generation is wired into CI,
>   `predev`/`prebuild`, and `generate-context.ts`. Agents write session metrics
>   to `task-tracking.json` (`check-exec-readiness` #2 reads it).

## Prerequisites before Phase 1/2 land (from the adversarial review — all MUST be met)

1. Add an **aggregate-only mode** to `syncMetricsFromCSV` (skip the
   `updateIndividualTaskFile` loop) — Gate 5's "generate + diff" cannot be built
   without it (today the orchestrator throws "Task file not found" against an
   empty temp dir).
2. The Phase 1 `.gitignore` change, the CI `generate:metrics` step, and the
   `validate-sprint-data.yml` path-trigger change land in **one atomic PR**, or
   the consistency gate silently stops firing.
3. The Phase 2 `task-tracking.json` schema **explicitly includes** `waivers`,
   `stoa_verdicts`, `implements`, `spec_sessions`, `context_verification`, and
   `branch_url`, and the one-time migration script extracts them from the 233
   per-task JSONs **before** any per-task gitignore — else permanent loss of
   waiver/STOA-verdict records.
4. Gate 3's metrics-fallback enumeration moves off `git ls-files`
   (`listGitTrackedFilesInPath`) to a disk walk, atomically with any per-task
   gitignore, or 233 attestation-less tasks silently downgrade to WARN.
5. **Supersede ADR-066** explicitly (its Decision Outcome blocks the gitignore
   path) so governance does not contradict the change.

## Accepted debt

- **METRICS-FABRICATION-DEBT-001.** `summary-generators.ts:201` still mints
  `completed_at = new Date()` for ~83 CSV-completed tasks that have no per-task
  JSON. It **carries forward** a prior value once written, so it is _stable_
  (not a churn source); the fabrication only fires once per such task. An honest
  fix (null / planned-finish + schema-aware sort handling) is deferred to avoid
  a `sprint-summary.schema.json` validation risk in a low-risk Phase 0. Tracked
  in the debt ledger.
- The ~199 already-committed fabricated `started_at`/duration values and ~61
  fake `echo` validations **remain in git history** — re-deriving real values
  for 260+ historical DONE tasks is infeasible. Phase 0 only stops _new_
  fabrication.

## Links

- Supersedes the "Phase 1 complete / Phase 2 withdrawn" outcome of **ADR-066**
  (the formatter mismatch means ADR-066 Phase 1 did not actually de-churn the
  committed repo).
- Key files: `apps/project-tracker/lib/data-sync/file-io.ts`,
  `task-json-updater.ts`, `summary-generators.ts`, `.prettierignore`,
  `.husky/pre-commit`, `tools/scripts/sprint-validation.ts` (Gates 3/5/6),
  `tools/scripts/validate-sprint-data.ts`.
