# Intent Layer — Analysis & Maintenance

Generated metadata for the **Intent Layer** model applied to this repo, adapted
to the repo's **Claude-only** policy. Upstream framework:
[`github.com/orban/intent-layer`](https://github.com/orban/intent-layer).

- **Run date:** 2026-05-30
- **Branch analyzed:** `fix/railway-cli-install`
- **Framework commit:** `2c4c5511e431e5ab3b86b3fcd6b4df67d481ee63`
- **Integration mode:** external read-only clone (`~/tools/intent-layer`) — no
  plugin install, no hooks registered, nothing vendored into the repo.

## Repo overrides (vs upstream defaults)

| Upstream default                        | This repo                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `AGENTS.md` nodes                       | **`CLAUDE.md` nodes only** (a pre-existing root `AGENTS.md` is left untouched; no new ones created) |
| `.intent-layer/` for metadata/telemetry | **`docs/operations/intent-layer/`** (this folder)                                                   |
| SessionStart/Pre/Post/Stop hooks        | **none** — not registered                                                                           |
| `integrate_pitfall.sh` writes to nodes  | manual edits to `CLAUDE.md` only                                                                    |

## Raw run artifacts (this folder)

| File                          | Script                                | Notes                                                                                                                             |
| ----------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `detect_state.txt`            | `detect_state.sh`                     | raw pre-fix scan (`has_intent_section: false`); root is `complete` after this PR adds the root `## Intent Layer` section (see §1) |
| `estimate_candidates.txt`     | `estimate_all_candidates.sh`          | token estimate (⚠ absolute numbers unreliable here — counts generated artifacts; use relative signal only)                        |
| `staleness_nodes.txt`         | `detect_staleness.sh`                 | node-level (all nodes "medium" = high commit churn, expected for active repo)                                                     |
| `staleness_entries_quick.txt` | `detect_staleness.sh --entries-quick` | ⚠ upstream bug (`line 158: File: unbound variable`) — replaced by adapted scan below                                              |
| `staleness_adapted.txt`       | manual adaptation                     | broken-path-ref scan over in-repo `CLAUDE.md`                                                                                     |

## Findings & actions taken (2026-05-30)

### 1. Root node had no Intent Layer marker → FIXED

`detect_state.sh` reported `has_intent_section: false`. Added a compact
`## Intent Layer` section to the root `CLAUDE.md` (points at the existing
"Context by Area" node map, this metadata folder, and records provenance). State
is now `complete`.

### 2. Stale references in nodes — 6 candidates, 2 genuine → FIXED

| Node                            | Reference                                                | Verdict                                                                                          |
| ------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/validators/CLAUDE.md` | `__tests__/enum-consistency.test.ts`                     | **STALE** → fixed to `.spec.ts`                                                                  |
| `packages/domain/CLAUDE.md`     | `packages/validators/__tests__/enum-consistency.test.ts` | **STALE** → fixed to `.spec.ts`                                                                  |
| `apps/api/CLAUDE.md`            | `src/types/intelliflow-adapters.d.ts`                    | false positive — historical root-cause gotcha (file _should_ be absent; deleting it was the fix) |
| `packages/db/CLAUDE.md`         | `memory/db-schema-history.md`                            | false positive — pointer to the Claude memory dir (file exists there)                            |
| `docs/operations/CLAUDE.md`     | `./other-runbook.md`                                     | false positive — a linking-convention _example_                                                  |
| `docs/operations/CLAUDE.md`     | `runbooks/notifications.md`                              | false positive — merge-history note (file intentionally merged away)                             |

### 3. Node-gap directories — 5 nodes CREATED (after per-dir exploration)

Sizable directories with real code that lacked a `CLAUDE.md` node. Each was
explored (package.json, README, barrel exports, file layout) before writing, to
avoid fabricated content (repo rule: _Never Mock or Simulate Data_). Ranked by
source-file count (the estimator's absolute token numbers are unreliable here).

| Directory                        | Source files | Status                                                                                                   |
| -------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------- |
| `tools/scripts`                  | 191          | ✅ node created                                                                                          |
| `packages/platform`              | 51           | ✅ node created                                                                                          |
| `apps/workers`                   | 46           | ✅ node created (meta-pkg → 4 sub-workers)                                                               |
| `packages/observability`         | 19           | ✅ node created                                                                                          |
| `packages/webhooks`              | 11           | ✅ node created                                                                                          |
| `packages/{ai,sdk,search}`       | 4–6          | initially below-threshold → ✅ node created after the §4 audit                                           |
| `infra/monitoring`, `tools/plan` | 0 code       | initially "skip" → ✅ node created after the §4 audit (parked/config subtrees still benefit from a node) |
| `docs/planning`                  | 0 code       | skipped — docs only, no node                                                                             |

Node inventory is now **25** (was 15). Root `CLAUDE.md` "Context by Area" /
Intent Layer section updated to match.

### 4. Orphan & inline-path wiring audit (the "below-threshold" dirs)

The dirs first dismissed as below-threshold were cross-audited for
dead/forgotten code and inline-path coupling. Findings (each now has a node):

| Dir                | Verdict                            | Evidence                                                                                                                                                                                                                 |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/ai`      | ⚠ **PARKED** — exports nothing     | entire `src/index.ts` export block commented out; `TODO: Case model missing from Prisma schema` (IFC-156); 0 dependents                                                                                                  |
| `packages/search`  | ⚠ **ORPHANED + likely duplicated** | 0 dependents; `@knipignore`-suppressed; intended consumer `apps/ai-worker` does NOT import it and has ~2,000 ln parallel impl (`document-indexer.ts`, `rag-context.chain.ts`, `embedding.chain.ts`, `reindex-worker.ts`) |
| `packages/sdk`     | ✅ **NOT dead** (false alarm)      | only non-`private` pkg; published external SDK (`prepublishOnly`); internal-importer-free **by design**                                                                                                                  |
| `tools/plan`       | ✅ **WIRED by inline path**        | Python; `apps/project-tracker/.../governance/migrate/route.ts` runs `cd tools/plan && python -m src.adapters.cli migrate`; hardcoded path + CWD                                                                          |
| `infra/monitoring` | ✅ **WIRED by inline path**        | config consumed by `health-server.ts`, `tools/scripts/observability/*`, `artifact-registry.ts`, `pipeline-status.yaml`                                                                                                   |

**Method (decisive check):** in a pnpm workspace a package cannot be imported
unless declared as a dependency. `@intelliflow/{ai,sdk,search}` are declared as
a dependency in **no** package.json but their own → not consumed by any
workspace package; no relative-path bypass found either.

**Recommended follow-ups (NOT done — need owner/ADR):**

1. `packages/ai`: unblock IFC-156 (see audit below) — the "Case model missing"
   blocker is **false**; fix the real bugs and uncomment `src/index.ts`.
2. `packages/search` vs `apps/ai-worker`: decide types-only vs wire-in (ADR).
3. Harden `tools/plan` coupling: the governance route depends on a hardcoded
   relative path + `src.adapters.cli` module path — keep both sides in sync.

### 5. `/task-code-audit` results — IFC-156 & IFC-155 (2026-05-30)

Two parallel audit agents ran the `task-code-audit` skill. Both corrected my
surface-level node claims (nodes updated accordingly).

**IFC-156 (Case RAG Tool, `packages/ai`) — VERDICT: PARKED / INCOMPLETE.** Code
exists but is non-functional and CSV `Completed` is unsupported:

- ❗ Stated blocker is **FALSE** — `Case` model exists (`schema.prisma:1713`).
- ❗ `caseId` validated as `z.uuid()` but IDs are **cuid** → all real IDs
  rejected (`retrieve-case-context.ts:66`).
- ❗ `verifyCaseAccess` RBAC query lacks `tenantId` → **cross-tenant
  escalation** (~:310–318).
- ❗ Claimed "43 tests" never run — vitest `include: src/**` misses
  `tools/__tests__/`.
- ❗ `requestApproval` duck-types a non-existent delegate → approvals **silently
  dropped** (~:768–805).
- ❗ Attestation `COMPLETE` while 8/9 DoD items `met:false`.

**IFC-155 (case search, `packages/search` + `apps/ai-worker`) — VERDICT:
ORPHANED / INCOMPLETE.** The ai-worker runtime is real & wired; the package +
attestation overstate delivery:

- `packages/search/*` is **type stubs only**; runtime is
  `RetrievalService`/`DocumentIndexer`/`ReindexWorker` in ai-worker. Not true
  duplication — divergent type contracts.
- ❗ GDPR purge **not atomic** — `dsar-workflow.ts:purgeSearchIndexes()` runs 2
  sequential `$executeRaw`, no `$transaction` (attestation claims atomic).
- ❗ `reindexAllNotes` uses `{ contact: { tenantId } }` though `ContactNote` has
  direct `tenantId` (`document-indexer.ts:496`).
- ❗ `retrieval-service-search.test.ts` tests a local `MockRetrievalService`,
  not the real service → ~0 behavioral coverage of search paths.
- `canAccess()` MANAGER role hardcoded `false` (untracked stub).

Full agent transcripts are not persisted here; re-run via
`Skill(task-code-audit, "IFC-156")` / `("IFC-155")`.

## How to re-run (read-only)

```bash
IL=~/tools/intent-layer/scripts
bash "$IL/detect_state.sh" .
bash "$IL/estimate_all_candidates.sh" .
bash "$IL/detect_staleness.sh" .
bash "$IL/detect_changes.sh" main HEAD          # nodes touched by current branch
bash "$IL/explain_semantic_diff.sh" --dry-run main HEAD
```

Never run the mutating/hook scripts (`integrate_pitfall.sh`,
`apply_template.sh`, `*-check.sh`, `inject-learnings.sh`, `learn.sh`) against
this repo — they assume `AGENTS.md` / `.intent-layer/`.
