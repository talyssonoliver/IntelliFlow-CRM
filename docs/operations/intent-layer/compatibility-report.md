# Intent Layer — Framework Compatibility & Final Report

**Date:** 2026-05-30 · **Repo:** IntelliFlow CRM · **Branch:**
`fix/railway-cli-install`

## Framework source & version

- **Upstream repository:** https://github.com/orban/intent-layer
- **Plugin installed in Claude Code?** No (marketplace `orban/intent-layer` not
  added; installed plugins: codex, context7, frontend-design, ralph-wiggum,
  vercel).
- **Integration used:** external read-only clone at `~/tools/intent-layer`
  (outside the product tree).
- **Cloned commit SHA:** `2c4c5511e431e5ab3b86b3fcd6b4df67d481ee63`

## Framework compatibility checks

| Check                            | Result                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Installation status              | not installed → cloned externally, read-only                                                                                                                             |
| Commit/version                   | `2c4c5511e431e5ab3b86b3fcd6b4df67d481ee63`                                                                                                                               |
| Slash commands                   | `/intent-layer`, `/intent-layer-maintenance`, `/intent-layer-onboarding`, `/intent-layer-query`, `/review-mistakes` (+ compound/health/git-history/pr-review sub-skills) |
| Agents                           | `explorer`, `validator`, `auditor`, `change-tracker`                                                                                                                     |
| Scripts read-only or mutating    | The 7 requested scripts are **read-only**. Mutating ones exist but were not run (see skipped).                                                                           |
| Scripts assume `.intent-layer/`? | Only `lib/common.sh` telemetry — **gated**: no-ops unless `.intent-layer/` already exists (it does not here). The 7 requested scripts do not.                            |
| Scripts assume `AGENTS.md`?      | They match **both** `AGENTS.md` and `CLAUDE.md`; `detect_state.sh` prefers `CLAUDE.md` at root. Only _recommendation text_ says "AGENTS.md" (adapted → `CLAUDE.md`).     |
| Safe to run here                 | `detect_state.sh`, `estimate_all_candidates.sh`, `detect_changes.sh`, `explain_semantic_diff.sh`, `suggest_updates.sh`, `detect_staleness.sh`, `review_pr.sh`            |
| Require adaptation               | "create AGENTS.md" / "split into child AGENTS.md" / `integrate_pitfall.sh` outputs → hand-mapped into `CLAUDE.md` instead                                                |

## Commands executed

| Command                                         | Purpose                      | Outcome                                                                              |
| ----------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------ |
| `gh api repos/orban/intent-layer` + `git/trees` | discovery                    | inventoried skills/agents/scripts                                                    |
| `git clone … && git checkout 2c4c5511…`         | external clone at pinned SHA | OK, outside product tree                                                             |
| `detect_state.sh .`                             | root state                   | before: `partial`; after edits: `complete`                                           |
| `estimate_all_candidates.sh .`                  | token candidates             | ran; absolute numbers unreliable (counts generated artifacts) → used relative signal |
| `detect_staleness.sh .`                         | node-level staleness         | all nodes "medium" (commit churn) — expected, no action                              |
| `detect_staleness.sh --entries-quick .`         | entry staleness              | **upstream bug** (`line 158: File: unbound variable`) → adapted manually             |
| adapted broken-path scan                        | entry staleness (manual)     | 6 candidates → 2 genuine, 4 false positives                                          |

## Commands skipped & why

| Skipped                                                                                                                  | Reason                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude plugin marketplace add/install`                                                                                  | Would register `hooks.json` (SessionStart/Pre/Post/Stop) that can auto-create `.intent-layer/` in this repo → violates overrides. User chose external read-only clone. |
| `detect_staleness.sh --entries` (full)                                                                                   | Same upstream `line 158` bug as `--entries-quick`; also heavy grep over the monorepo. Replaced by adapted scan.                                                        |
| `suggest_updates.sh` / `explain_semantic_diff.sh` (AI mode)                                                              | Require `ANTHROPIC_API_KEY`; not needed — staleness was resolved by the adapted scan. Available read-only on request.                                                  |
| `integrate_pitfall.sh`, `apply_template.sh`, `inject-learnings.sh`, `learn.sh`, `report_learning.sh`, `*-check.sh` hooks | Mutating; assume `AGENTS.md` / `.intent-layer/`. Forbidden by overrides.                                                                                               |

## Repository-specific adaptations applied

1. **CLAUDE.md only** — all node work targeted `CLAUDE.md`; no `AGENTS.md`
   created or modified.
2. **Metadata folder** — analysis output stored in
   `docs/operations/intent-layer/`, never `.intent-layer/`.
3. **Root node marker** — added `## Intent Layer` to root `CLAUDE.md` (the
   upstream "Intent Layer section" concept) instead of a generated `AGENTS.md`.
4. **Staleness fixes** — `enum-consistency.test.ts` → `.spec.ts` in
   `packages/validators/CLAUDE.md` and `packages/domain/CLAUDE.md`.
5. **Token recommendations re-ranked** — by source-file count (estimator
   unreliable here), and "AGENTS.md" recommendations mapped to nested
   `CLAUDE.md`.
6. **No hooks** — framework hooks were neither installed nor registered.

## Confirmation

- ✅ **No `AGENTS.md` was created or modified.** (A pre-existing root
  `AGENTS.md`, tracked since 2026-04-19, was left untouched.)
- ✅ **No `.intent-layer/` directory was created.**
- ✅ No symlinks, shims, or new top-level metadata folders were created.
- ✅ Framework was not vendored/copied into application source (`apps/`,
  `packages/`).

## Files changed in the repo by this session

- `CLAUDE.md` — added `## Intent Layer` section
- `packages/validators/CLAUDE.md` — staleness fix
- `packages/domain/CLAUDE.md` — staleness fix
- `docs/operations/intent-layer/**` — new metadata folder (this report +
  analysis + raw run artifacts)
