# ADR-066: Collapse the Sprint-Metrics Write Cascade and Shrink the Derived Tracked Surface

**Status:** Superseded by
[ADR-067](./ADR-067-metrics-harness-dechurn-and-canonical-split.md) (Phase 2
makes the entire per-task metrics tree a generated, gitignored cache and
relocates the sole-copy canonical content to `.specify/.../task-tracking.json` —
the de-churn this ADR proposed, completed without leaving the per-task JSONs
tracked.)

**Date:** 2026-06-14

**Deciders:** talyssonoliver (owner), Claude Code

**Technical Story:** Sprint-18 metrics-architecture retro (no single task ID —
surfaced by the Wave-3 CSV-conflict cascade on PRs #424/#425)

## Context and Problem Statement

The sprint tracker was designed at project start for ~30 tasks. It now tracks
**316 tasks across 34 sprints**, and the per-task tracking model has stopped
scaling:

1. **Write cascade.** Editing one task's status and running the sync
   (`sync-metrics.ts` → `syncMetricsFromCSV`) rewrites **~480 per-task JSON
   files** (`apps/project-tracker/docs/metrics/sprint-*/**/*.json`). 542 files
   are tracked under `docs/metrics`; a one-line CSV change produces a
   hundreds-of-files diff.
2. **Churn even when nothing changed.** `writeJsonFile`
   (`apps/project-tracker/lib/data-sync/file-io.ts:26`) **always writes** — no
   skip-if-unchanged. Worse, `task-json-updater.ts` **re-derives volatile fields
   on every run**: `applyDependencySatisfied` stamps
   `dependencies.verified_at = new Date()`, `applyArtifactClassification`
   re-stats disk, and `applyCompletionTimestamps` fabricates
   `started_at = new Date(Date.now() - 15*60*1000)` and
   `actual_duration_minutes = target_duration_minutes || 15`. So every sync
   mutates every file regardless of whether the underlying task changed.
3. **Merge-conflict amplification.** Because a status flip touches the CSV
   **and** hundreds of JSONs, two in-flight feature branches that each complete
   one task collide on `Sprint_plan.csv` and overlapping JSONs. This is exactly
   what made Wave-3 PRs #424 (PG-063) and #425 (IFC-280) go DIRTY when sibling
   merges and a reconciliation moved `main` underneath them.
4. **Anti-fabrication smell.** The re-derived runtime fields are not measured
   facts — they are defaults recomputed with `new Date()` each sync. CLAUDE.md's
   "Never Mock or Simulate Data" rule says displayed data must come from real
   sources; these timestamps are neither real nor stable.

How do we make a task-status update touch O(1) files instead of O(n), without
losing any canonical evidence or breaking the dashboard / matop consumers?

## Decision Drivers

- **Performance/maintainability at current scale** — one task edit must not
  rewrite hundreds of files or jam the PR queue with phantom CSV/JSON conflicts.
- **No loss of canonical evidence.** Canonical task evidence already lives in
  `.specify/sprints/sprint-N/attestations/`, and the Evidence-Integrity gate
  (`tools/scripts/sprint-validation.ts`, Gate 3) **already prefers `.specify/`
  attestations and uses the per-task JSONs only as a fallback**. The derived
  JSONs hold no source-of-truth data.
- **Consumers keep working.** Dashboard APIs and the matop pipeline
  (`matop/plan`, `matop/spec`, `artifact-registry`, `dependency-graph`,
  governance routes) currently read the per-task JSONs.
- **Reversibility / low blast radius first.** Prefer a fix that kills the churn
  without changing the tracked surface, before any structural change.
- **Single source of truth preserved.** `Sprint_plan.csv` stays the human-edit
  source; `.specify/` stays canonical evidence. Only the _derived_ layer
  changes.

## Considered Options

- **Option 0 — Do nothing.** Keep the cascade; manage conflicts by hand.
- **Option 1 — De-churn the writer (tactical, no surface change).** Make
  `writeJsonFile` skip-if-unchanged (serialize, compare to existing bytes, write
  only on diff) and stop re-deriving volatile fields for tasks whose status did
  not change. A sync then touches only the JSONs that actually changed.
- **Option 2 — Shrink the tracked surface (structural).** `.gitignore` the ~480
  derived per-task JSONs, generate them at build/CI on demand, and change Gate 5
  ("Metrics Tracked State: no untracked files") to **"generate + assert
  consistency"** (regenerate from CSV + `.specify/`, assert the working tree
  matches; drift fails CI without committing the artifacts).
- **Option 3 — Consolidate the source (longer-term).** Collapse the ~480
  per-task JSONs into one derived read-model — a single `Sprint_plan.json` index
  or a SQLite DB — that the dashboard and matop query. The per-task JSON tree
  disappears entirely; a task edit touches the CSV plus one generated artifact.

## Decision Outcome

**Chosen path: a staged rollout — Option 1 now, this ADR authorizes Option 2
next, Option 3 deferred behind a consumer-refactor spike.**

- **Phase 1 (do now, focused chore PR): Option 1.** It removes the cascade
  immediately, changes no tracked surface, touches no consumer, and is trivially
  reversible. After Phase 1, a one-task flip yields a handful of changed files
  (CSV + its splits + the one task JSON + the regenerated session/context
  reports) instead of hundreds — the cascade and the merge-conflict
  amplification both go away. This also fixes the anti-fabrication smell: stable
  fields stop being recomputed with `new Date()` on every unrelated sync.
- **Phase 2 (proposed Option 2) — BLOCKED BY DESIGN, do NOT attempt as a
  gitignore (investigated 2026-06-14).** The premise that the derived JSONs are
  cleanly gitignorable is false on inspection:
  1. The ~414 per-task `sprint-*/<TASK>.json` carry **canonical** hand-authored
     content (`notes`, `kpis.actual`, `status_history`, `blockers`, validation
     evidence) that is **not** in the CSV or `.specify/`. Example: `IFC-265` has
     no `.specify` attestation (its own JSON lists `context_ack.json` as
     missing) yet carries a rich `notes` / `kpis.actual` / `status_history` —
     the metrics JSON is the **sole** copy. Gitignoring + regenerating would
     silently drop it.
  2. Even the 3 genuinely CSV-derived aggregates (`_global/Sprint_plan.json`,
     `task-registry.json`, `dependency-graph.json`) are **locked tracked by a
     FAIL-always gate**: `validation-utils.ts:562-564` declares them canonical
     source-of-truth and **Gate 6 (Canonical Uniqueness)** asserts they exist
     "exactly once in **tracked** files." Gitignoring them ⇒ 0 tracked ⇒ Gate 6
     fails. Gate 3 (Evidence Integrity) likewise requires the per-task JSONs
     tracked.
  3. **This was already tried and reverted.** `.gitignore:183-199` documents a
     2026-04-10 attempt to ignore these "runtime cache" files, undone because
     Gates 3 + 6 require them tracked. So surface-reduction is **not** a
     gitignore + a gate tweak — it means dismantling a deliberately-built
     governance invariant for ~zero benefit now that Phase 1 has removed the
     churn. **Leave the tree tracked.**
- **Phase 3 (the only real path to surface-reduction, deferred).** Highest
  payoff, highest cost: it must **co-redesign** (a) a single canonical home for
  per-task content (consolidate into `.specify/` attestations or a SQLite/JSON
  read-model), (b) the generators (reconstruct the derived layer from that
  home), AND (c) the Gate 3 / Gate 5 / Gate 6 governance checks together — plus
  rewrite the matop + dashboard consumers. This is its own project with its own
  ADR, not a follow-on to Phase 1. Not started until a spike scopes it.

### Positive Consequences

- A task-status update touches O(1) files; the PR-queue CSV/JSON conflict class
  (Wave-3 #424/#425) disappears.
- Smaller, reviewable diffs; `git blame`/history on metrics becomes meaningful.
- Canonical evidence is untouched — `.specify/` remains the source Gate 3
  trusts.
- Removes a standing anti-fabrication violation (recomputed fake timestamps).

### Negative Consequences

- Phase 2 (gitignore) is **withdrawn** — the per-task tree stays tracked because
  Gates 3/6 treat it as canonical (see Decision Outcome). No tracked-surface
  reduction lands without Phase 3.
- Phase 3 is a real migration (canonical-store + generators + governance gates +
  consumer rewrite) — deferred, not free.
- Volatile fields stop changing on every sync; any (unlikely) consumer that
  depended on a freshly-stamped `verified_at` per run must read the attestation
  instead.

## Pros and Cons of the Options

### Option 1 — De-churn the writer

- Good, because it kills the cascade with no change to the tracked surface or
  any consumer.
- Good, because it is small, low-risk, and reversible (revert the writer
  change).
- Good, because it ends the fabricated-timestamp churn (anti-fabrication).
- Bad, because ~480 files remain tracked — the surface is still large, just
  quiet; a future bug could re-introduce churn.

### Option 2 — Shrink the tracked surface

- Good, because "touch one file → rewrite 500" becomes structurally impossible.
- Good, because Gate 3 already treats `.specify/` as canonical, so gitignoring
  the derived JSONs loses no source-of-truth data.
- Good, because the consistency gate still catches drift in CI.
- Bad, because consumers must get the JSONs generated (build step) or be
  repointed; adds a generate step to local/dev flows.

### Option 3 — Consolidate the source

- Good, because it is the real fix — one read-model, O(1) writes, no per-task
  file tree.
- Good, because it makes querying (dashboard, matop) faster and simpler than
  fanning out across hundreds of files.
- Bad, because it is the largest change: the matop pipeline and dashboard APIs
  must be rewritten against the new read-model.
- Bad, because it is premature before Phase 1/2 prove out the
  derived-vs-canonical split.

## Links

- Refines / supersedes the original tracker design under
  `apps/project-tracker/docs/metrics/` (see `apps/project-tracker/CLAUDE.md` —
  "derived; sync overwrites; never hand-edit").
- Related: ADR-060 (Required Checks Policy) — Gate 5 change must stay consistent
  with required-check expectations.
- Key files: `apps/project-tracker/lib/data-sync/file-io.ts` (writer),
  `apps/project-tracker/lib/data-sync/task-json-updater.ts` (volatile fields),
  `tools/scripts/sprint-validation.ts` (Gates 3 & 5),
  `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` (source of truth),
  `.specify/sprints/sprint-N/attestations/` (canonical evidence).

## Implementation Notes

### Phase 1 (this ADR's immediate, separable PR) — IMPLEMENTED 2026-06-14

Measured on a temp copy of the real tree (sync run twice, diff run-A vs run-B):
**no-op churn went from ~480 files to 0** — the sync is now idempotent. The
per-task cascade was the dominant cause; the residual 32 roll-up files were each
a `last_updated` / "Last synced" / `calculated_at` freshness stamp.

1. `writeJsonFile` (file-io.ts): skip-if-unchanged — `return` without writing
   when the serialized bytes are byte-identical to disk. Trailing-newline
   preserved.
2. `writeJsonFileStable` (new, file-io.ts): writes only if the payload changed
   when ignoring named top-level volatile keys, carrying the prior stamp forward
   otherwise. Used for `dependency-graph.json` and `task-registry.json`
   (`last_updated`).
3. `task-json-updater.ts`: re-stamp `dependencies.verified_at` only when the
   satisfied-state or required set actually changes (was `new Date()` every sync
   — the core per-task churn).
4. `summary-generators.ts`: stamp phase `completed_at` once; carry CSV-only
   `completed_at` forward; refresh the `_summary.json` "Last synced" note only
   when the task counts change (no consumer reads that timestamp — verified).
5. `schedule-sync.ts`: carry `schedule.calculated_at` forward when the computed
   schedule is unchanged; route through `writeJsonFile` (skip-if-unchanged).
6. `updateTaskRegistry` refactored (extracted `parseSprintNumber` /
   `buildTaskDetail` / `deriveActiveSprint`) to clear a pre-existing
   cognitive-complexity-22 violation surfaced by the whole-file
   `lint:sonar:guard` once the file was touched (co-dependent fix).
7. `sonar-project.properties`: add `apps/project-tracker/lib/data-sync/**` to
   `sonar.coverage.exclusions` (the old monolith `lib/data-sync.ts` was already
   excluded; the split-out directory was missed). Keeps server-side
   `new_coverage` from scoring these instrumentation-excluded files.
8. Regression test: `__tests__/data-sync/de-churn.test.ts` (skip-if-unchanged,
   `writeJsonFileStable` carry-forward, task-updater idempotency).
9. No `.gitignore`, gate, or consumer change in Phase 1.

### Phase 2 — WITHDRAWN (investigated 2026-06-14, not implemented)

The original sketch below does **not** survive contact with the codebase — see
the BLOCKED note under Decision Outcome. A naive
`.gitignore apps/project-tracker/docs/metrics/sprint-*/**/*.json` would (a) drop
canonical per-task content not stored anywhere else, and (b) fail Gate 6
(Canonical Uniqueness) + Gate 3 (Evidence Integrity), which require these files
git-tracked — the same wall a 2026-04-10 attempt hit and reverted
(`.gitignore:183-199`). Do not re-attempt as a standalone gitignore. Surface
reduction now belongs entirely to Phase 3 (canonical-store + generators + Gates
3/5/6 + consumers redesigned together, with its own ADR).

~~Original sketch (superseded): gitignore the per-task JSONs; add a generate
step; rewrite Gate 5 to generate-and-assert-consistency.~~

### Validation Criteria

- [x] Phase 1: running sync twice with no CSV change produces **zero** file
      diffs — measured ~480 → 0 no-op churn on a temp copy of the real tree.
- [x] Phase 1: a single-task CSV flip now touches only that task's JSON plus the
      roll-ups whose counts actually changed (no blanket per-task rewrite).
- [x] Phase 2: investigated 2026-06-14 — **withdrawn**; gitignoring the derived
      JSONs is blocked by canonical per-task content + Gate 6 / Gate 3 (which
      require them tracked) + a prior 2026-04-10 revert. Surface reduction
      folded into Phase 3.
- [ ] Phase 3 (if pursued): spike the canonical-store consolidation + generator
      rewrite + Gate 3/5/6 redesign + consumer migration, behind its own ADR.

### Rollback Plan

- Phase 1: revert the `file-io.ts` / `task-json-updater.ts` change — behavior
  returns to always-write.
- Phase 2: remove the `.gitignore` entries, re-commit the generated JSONs, and
  restore Gate 5 to the "no untracked files" form. Canonical evidence in
  `.specify/` is never touched by either phase, so rollback is data-safe.
