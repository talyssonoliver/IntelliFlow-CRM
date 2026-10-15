# Ceremony Tier — Decision Boundary (issue #579)

## Why this exists

Every `/full-pipeline` invocation ran the same ~5.5h ceremony regardless of task
complexity: a 3-persona spec debate (`/spec-session` Rounds 1–4), a mandatory
Plan-Reviewer subagent (`/plan-session` Phase 4), and the full MATOP validation.
A module-settings page that is the 4th or 5th copy of an already-proven pattern
(PG-182/183/184/185, following PG-178) got the same ceremony as a novel
architectural change. Wrong ROI for template work.

`ceremony_tier` is `light` or `full`. It changes how much ceremony
`/spec-session` and `/plan-session` run — **it never changes correctness
validation**. See "Out of scope" below.

## Where the tier lives

The issue allowed either a new `Sprint_plan.csv` column or a separate config
file. This implementation uses **`.specify/memory/task-tiers.yaml`**, not a CSV
column, because:

- `Sprint_plan.csv` is the single source of truth and has nine downstream
  artifacts that would need regenerating for a new column: the ten
  `Sprint_plan_*.csv` token-split files, `task-registry.json`,
  `task-tracking.json`, and the JSON Schemas under
  `apps/project-tracker/docs/metrics/schemas/`. Most tasks will never need an
  override — the heuristic classifies every task from columns the CSV already
  has.
- A manual override is an exception, not routine data entry. A YAML file under
  version control, reviewed in the same PR as the task it overrides, is the
  right weight for "a human decided this one heuristic call was wrong."

`ceremony_tier` is therefore **computed, not stored**, for the overwhelming
majority of tasks: run the audit (below) and read the result. Only a genuine
correction goes in `.specify/memory/task-tiers.yaml`.

## Running it

```bash
# Classify every backlog task (Status != Completed/Done), print a table,
# write artifacts/reports/ceremony-tier-audit.json (git-ignored, regenerable)
npx tsx tools/scripts/ceremony-tier-audit.ts

# Classify one task — this is what /full-pipeline's Phase 0.3 runs
npx tsx tools/scripts/ceremony-tier-audit.ts --task PG-999

# Machine-readable, for a caller that parses stdout
npx tsx tools/scripts/ceremony-tier-audit.ts --task PG-999 --json
```

The classifier itself (`tools/scripts/lib/ceremony-tier.ts`) is pure and
unit-tested (`tools/scripts/lib/ceremony-tier.test.ts`) — no I/O, no CSV
parsing. The CLI and the YAML override loader
(`tools/scripts/lib/ceremony-tier-config.ts`) are thin wrappers around it.

## The four conditions

`tier` is `light` only when **all four** pass — this is an AND, not a score. A
single failing condition requires the full ceremony.

| #   | Condition                      | How it's checked                                                                                                                                | Threshold                           |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| (a) | Lane is template-following     | `assignStoas(task).primaryStoa` — the **same** STOA assignment `/exec` already uses for MATOP, not a re-derivation from the `Owner` column text | `Foundation` or `Domain` only       |
| (b) | Dependencies are already done  | Parse `Dependencies` (comma-separated Task IDs); every one must have `Status` `Completed`/`Done`                                                | ≤ 2 dependencies, **all** completed |
| (c) | References an existing pattern | Case-insensitive search of `Description` + `Definition of Done` for: `pattern`, `playbook`, `follows`, `mirror`, `matching the`                 | any one keyword present             |
| (d) | Small                          | `Estimate (O/M/P)`'s most-likely (M) value, in hours                                                                                            | ≤ 6h                                |

### Why these four, and why AND not a score

- **(a) reuses `assignStoas()` deliberately.** `PG-*` → `Foundation`, `IFC-*` →
  `Domain` by `STOA_PREFIX_RULES` (`tools/scripts/lib/workflow/config.ts`) —
  exactly the page-component and core-feature lanes the issue's own example
  (`PG-178` module-settings pages) lives in.
  `Security`/`Quality`/`Intelligence`/`Automation` are never template-following:
  a security or AI task needs fresh judgment every time, regardless of how small
  or dependency-light it looks.
- **(b) requires the dependencies to be _done_, not just _listed_.** A task with
  1 dependency that is still `In Progress` has no proven pattern to copy yet —
  it's the first of its kind in practice even if the CSV says otherwise. An
  unresolved or unknown dependency ID fails closed (counts as "not completed"),
  never silently passes.
- **(c) is the actual "is there a pattern to copy" signal**, read from the same
  prose a human already writes when they build on prior art — see PG-182 ("uses
  in-module settings sidebar pattern") and PG-184/185 ("MUST follow
  `docs/planning/module-settings-playbook.md`"). A task that doesn't cite one is
  implicitly claiming to be the first of its kind, which is exactly when the
  multi-persona debate earns its cost.
- **(d) exists because a "template" task can still be big** — 11 files, a new
  router, a new Zod schema. Size alone doesn't make something light, but a large
  template task is also not light.
- **AND, not an average**: any one of these failing is a real reason the task
  needs fresh scrutiny. A weighted score would let "small + has a pattern"
  outvote "3 un-shipped dependencies," which is exactly the kind of task where
  skipping the debate would reproduce the PG-184-class gaps the Plan-Reviewer
  was hardened against (see `plan-session/references/plan-reviewer.md` and the
  `check-plan-reviewer-subagent.mjs` preflight history).
- **Fails closed**: an unparseable or missing `Estimate (O/M/P)` is treated as a
  FAIL on condition (d), never defaulted to pass. Unknown territory gets the
  full ceremony, not the light one.

### Validated against real history

Running the audit against the issue's own example lineage
(`apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`):

| Task   | Tier    | Why                                                                                                                                                                                  |
| ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PG-178 | `full`  | 8h estimate (condition d fails) — correctly the original, full-ceremony task                                                                                                         |
| PG-182 | `light` | 1 completed dependency, cites "in-module settings sidebar pattern", 4h                                                                                                               |
| PG-183 | `light` | same shape as PG-182                                                                                                                                                                 |
| PG-184 | `full`  | 3 dependencies (condition b fails: `PG-178,PG-182,PG-183`) — correctly flagged, since its DoD lists cross-tenant negative-test and toggle-wiring requirements PG-182/183 didn't have |
| PG-185 | `full`  | same as PG-184                                                                                                                                                                       |

This is not a coincidence the heuristic was tuned to produce — PG-184/185's
`Definition of Done` genuinely does carry more risk (explicit `$transaction`,
`skipDuplicates`, cross-tenant test, and toggle-wiring call-outs that PG-182/183
don't have), and the 3-dependency count is a real signal of that, not an
artifact of the fixture.

Running the full audit against every current backlog task
(`npx tsx tools/scripts/ceremony-tier-audit.ts`, no `--task`) classifies 188
tasks: 21 `light`, 167 `full` — see `artifacts/reports/ceremony-tier-audit.json`
for the complete list (the file is git-ignored; regenerate it, it is not
committed).

## How `/full-pipeline` consults it

**Phase 0.3: Ceremony Tier Detection** (see `SKILL.md` and
`references/pipeline-phases.md`) runs once per invocation, before Phase 1:

1. Run `npx tsx tools/scripts/ceremony-tier-audit.ts --task {TASK_ID} --json`.
2. Record the `tier` field in the task's hydrated context
   (`.specify/sprints/sprint-{N}/context/{TASK_ID}/{TASK_ID}-hydrated-context.json`,
   key `ceremony_tier`), alongside the `checks` array as the paper trail for
   why.
3. Pass the tier to `/spec-session` and `/plan-session` as an explicit argument:
   `Skill(skill: "spec-session", args: "{TASK_ID} --tier={tier}")`.
4. If the audit script itself fails (parse error, task not found), treat that as
   `full` and proceed — never let a tooling failure silently grant the light
   path.

### `/spec-session` — Light Tier Mode

When invoked with `--tier=light`:

- Phases 0, 0.5, 0.75 (context hydration, agent selection, codebase exploration)
  still run, but Phase 0.5 picks **exactly one** persona instead of 3–5: the
  Lane from the tier-detection result decides which — `Foundation`/UI-leaning →
  `Frontend-Lead`, otherwise → `Backend-Architect`. No `Domain-Expert`, no
  `Test-Engineer` added on top.
- Phases 0.9/0.92/0.95/0.97 (dependency verification, UI reachability, PRD/ADR
  resolution) run **unchanged** — these are correctness/reuse checks, not
  ceremony.
- Rounds 1–4 (ANALYSIS → PROPOSAL → CHALLENGE → CONSENSUS) collapse into a
  single pass: the one persona writes the spec directly after Phase 0.75
  exploration. There is no debate partner, so there is nothing to challenge —
  this is what "adversarial reviews skipped" means in practice: the CHALLENGE
  round needs a second persona to challenge, and a light-tier spec never has
  one.
- Output format and the `## Related Documents` PRD/ADR section are unchanged.

### `/plan-session` — Light Tier Mode (scoped)

When invoked with `--tier=light`:

- Phases 0–3 (load spec, dependency verification, TDD decomposition, CSV
  artifact alignment) run unchanged.
- Phase 4 (spawn Plan-Reviewer) is **skipped only when the plan does not create
  an `apps/web/src/app/**/page.tsx`\*\*. If it does, the Plan-Reviewer subagent
  still runs, full stop.

**Attestation provenance gate.** Skipping the Plan-Reviewer must also survive
`tools/scripts/exec-preflight/check-attestation-provenance.mjs`, which runs
after the attestation is written and requires an affirmative
`plan_reviewer_verdict` plus the subagent marker for every `PG-`/`IFC-` task
(all 21 current light tasks are `PG-`/`IFC-`). That gate now re-derives the tier
itself (same classifier and overrides file as Phase 0.3) and waives the reviewer
evidence only when ALL hold: no `plan_reviewer_verdict` was claimed, the
re-derived tier is `light`, the plan carries `ceremony_tier: light`, and the
plan creates no `page.tsx`. Failing to derive the tier counts as `full`. A light
attestation therefore omits `plan_reviewer_verdict` and sets
`"ceremony_tier": "light"` (informational only; the gate does not trust it).

This page.tsx carve-out is deliberate, not an oversight:
`tools/scripts/exec-preflight/check-plan-reviewer-subagent.mjs` hard-blocks any
`PG-`/`IFC-` task that creates a page without real Plan-Reviewer subagent
evidence, specifically because a self-review bypass (PG-184 iteration-3 §3.2
miss, PG-057) already cost a full exec cycle once. That preflight is untouched
by this change. A light-tier plan that creates a page.tsx still gets the
Plan-Reviewer; a light-tier plan that doesn't (e.g. a backend-only template
task) skips it. If a future change wants to also skip the reviewer for
page-creating light-tier tasks, it must first extend
`check-plan-reviewer-subagent.mjs` to independently re-derive the tier from
Sprint_plan.csv (not trust a claim written into the plan) before accepting a
tier-based marker as sign-off evidence — mirroring how Gate 14 (Lighthouse) is
artifact-based specifically so it "cannot be text-hacked." That re-verification
is NOT implemented yet; do not add a bare `<!-- ceremony-tier: light -->` marker
to the preflight's acceptable-evidence list without it.

## Out of scope (deliberately)

- **MATOP / STOA gate assignment in `/exec`** (`assignStoas()`, typecheck, test,
  lint, build, and the STOA-specific correctness gates) does **not** change with
  tier. Those are correctness validation, not ceremony — the repo's own rule is
  "ALL 4 validations are NON-NEGOTIABLE" regardless of how the task got there.
  The issue's "adversarial reviews skipped" is the spec-session CHALLENGE round,
  not MATOP.
- **Skipping `/exec`'s adversarial/MATOP review for light tasks is an explicit
  scope decision, not an omission.** The issue text can be read as asking for
  it; this change deliberately does not implement it, because `/exec` MATOP
  validation is the only independent correctness check on the code itself and
  the issue's own premise is that ceremony, not correctness validation, is the
  waste. The saving is therefore limited to the spec debate and (for non-page
  tasks) the Plan-Reviewer. Revisit only with measured data from the
  acceptance-criterion-4 comparison below.
- **Measuring the actual wall-clock + token delta** between a light-tier and
  full-tier run of a matched pair of template tasks (the issue's 4th acceptance
  criterion) requires running `/full-pipeline` twice end-to-end on a real task —
  real LLM time and spend. That has **not** been done as part of this change;
  the mechanism to do it exists (`--task <ID> --json` gives the classification
  instantly, and the per-session cost/duration is already in Claude Code's own
  transcript), but actually spending the tokens on two full runs needs a task
  picked and a go-ahead, not a unilateral spend. Pick a light-tier task from the
  audit's current list (e.g. one of `PG-196`..`PG-209`, `IFC-216`..`IFC-283`)
  and its nearest full-tier sibling to run the comparison when that's wanted.
  **Because this criterion is open, the PR for this change must not close #579**
  (use "Refs #579", not "Closes/Fixes").
