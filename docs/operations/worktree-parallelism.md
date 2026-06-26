# Parallel-Worktree Operating Model

How the Sprint fleet keeps the main repo and N parallel task worktrees from
going stale, stuck, or outdated. Decided 2026-06-26.

## The problem (observed, not hypothetical)

Git worktrees share **one** object DB and **one** set of refs, so a single
`git fetch` updates `origin/main` for all of them. Staleness is therefore not
about objects — it is four distinct things, and at the time this was written the
repo was in all of them at once: local `main` 5 commits behind `origin/main`,
the main dir carrying 411 dirty files (so it could not even
`git pull --ff-only`), and 7 GB of orphaned worktrees under
`.claude/worktrees/agent-*`.

| #   | What goes stale                                                                   | Trigger                                   | Remedy                                                           |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| 1   | A worktree's **branch** (forked from an old `origin/main`)                        | any sibling merge                         | re-merge `origin/main` into the feat branch                      |
| 2   | The main dir's **local `main`**                                                   | any merge                                 | `git pull --ff-only` (needs a clean tree)                        |
| 3   | A worktree's **build artifacts** (`node_modules`, `packages/dist`, `.next/types`) | a re-merge that touched deps/packages     | `pnpm install` + rebuild packages + clear `apps/web/.next/types` |
| 4   | Orphaned worktree **directories**                                                 | `worktree remove` left a locked/empty dir | harness reclaims; periodic audit sweeps the rest                 |

## The keystone: main dir = control plane, never a workspace

The `orchestrator` runs in the main working dir and **never edits source**
there. It only: fetches, reconciles status against `origin/main`, dispatches
executors, holds the merge token, merges PRs, and does the post-merge CSV flip.
Because it never edits source, its tree stays clean → it can always
`git pull --ff-only` and never lags.

This is **load-bearing** under the chosen worktree model (below):
harness-managed worktrees fork from the control plane, so a stale/dirty control
plane is inherited by every executor. If `git pull --ff-only` on the main dir
ever fails, stop — the control plane is contaminated; reconcile before
dispatching.

## Decisions

- **Worktree lifecycle = harness-managed** (`Agent({ isolation: "worktree" })`).
  The harness creates and auto-reclaims each executor's worktree; we run no
  `git worktree add/remove` and maintain no pool tooling. (A committed branch
  may linger past auto-clean — the orchestrator verifies reclamation and the
  periodic audit sweeps stragglers.)
- **Merge cadence = strict serialize.** One PR merges at a time; the
  orchestrator holds the token. Every other in-flight worktree is flagged
  `needs-resync` the instant a merge lands and must re-merge `origin/main` +
  rebuild-if-deps-changed
  - re-run pre-ship + re-trigger CI before it may merge. This collapses the
    semantic-conflict window (renamed exports break with no textual conflict).

## Invariants the agents enforce

1. **Cut fresh** — executors fork from a control plane kept even with
   `origin/main`.
2. **Rebase-before-merge** — a branch merges only when even with current
   `origin/main`.
3. **Build-refresh on dep change** — after a re-merge touching
   `pnpm-lock`/`packages/**`: `pnpm install` +
   `turbo build --filter='./packages/*'` + clear `apps/web/.next/types`.
4. **Control plane tracks origin** — `git pull --ff-only` after every merge.
5. **One writer per branch/worktree** — owner ledger; delegated == in-flight ==
   owned.
6. **Concurrency cap 3** — shared local test DB (:5433) + dev ports; drop to 2
   if pre-ship runs start timing out.
7. **Conflict groups serialize** — tasks sharing hot files (e.g. Lane G all
   append to `settings-search.ts` + the root tRPC router) never run
   parallel-to-merge; batch ≤2, re-merge main between.

## Cleanup prerequisites (run once before the next fleet starts)

- Get the control plane clean + current (commit or clear pending edits, then
  `git pull --ff-only` to `origin/main`).
- Reclaim the 7 GB orphaned `.claude/worktrees/agent-*` (audit with
  `node tools/scripts/worktree-pool/migrate-existing.mjs --plan`; removal is a
  manual, destructive-guard-aware step).

## Related

- `.claude/agents/orchestrator.md` · `.claude/agents/task-executor.md`
- `.claude/skills/dispatch-task/` + `tools/scripts/generate-task-prompt.mjs`
- `docs/operations/sprint-18-orchestrator-prompt.md` — the sprint plan + §C
  matrix
