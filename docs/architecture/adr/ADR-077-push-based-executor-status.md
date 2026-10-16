# ADR-077: Push-based executor status file in front of orchestrator polling

**Status:** Proposed

**Date:** 2026-10-16

**Deciders:** Talysson Oliveira (Owner)

**Technical Story:** Issue #581 (related: #578)

## Context and Problem Statement

The orchestrator (`.claude/agents/orchestrator.md`) learns what each
`task-executor` is doing by reading its transcript (`read_transcript`) and by
polling git state (`git ls-remote`, `gh pr checks`, attestation blobs). Every
transcript read is a tool round-trip: it costs wall time and puts a slice of the
executor's transcript into the orchestrator's context. The cost grows linearly
with the number of live executors and with how often the orchestrator must wake
a parked one, so it is minor at 3 agents and dominant at 10-15.

Can executors publish their own state to a small file the orchestrator reads
cheaply, without weakening the checks the orchestrator already relies on?

## Decision Drivers

- Cost per orchestrator check should not scale with transcript length.
- A crashed or OOM-killed executor can never write a "final" status, so absence
  of updates must be detectable, not look like health.
- No behaviour change for anything that works today; the git/CI checks that back
  the Definition of Done must stay authoritative.
- Up to 15 writers and one reader on one Windows host: no lock service, no
  daemon.
- Executors run in separate worktrees, the orchestrator in the main clone.

## Considered Options

- **Option 1:** Keep polling transcripts (status quo).
- **Option 2:** One JSON file per task, written by the executor on phase change
  plus a heartbeat, read by the orchestrator; polling stays as the fallback.
- **Option 3:** A single shared status file or SQLite database for all tasks.
- **Option 4:** A local HTTP/socket endpoint the executors push to.

## Decision Outcome

Chosen option: "Option 2, one JSON file per task with polling retained as the
fallback", because it is the only option that removes the per-check transcript
cost without a shared mutable resource, a daemon, or a new failure mode that can
hide a dead executor.

### Answers to the design questions in #581

1. **Format.** `schema_version`, `task_id`, `phase`, `gate_status`, `terminal`,
   `seq`, `last_updated`, `heartbeat_s`, `pid`, plus optional
   `next_expected_event`, `detail`, `branch`, `mem_mb`, `cpu_s`. `phase` is one
   of
   `setup, spec, plan, exec, validate, preship, ci, ready, merged, blocked, failed`;
   `gate_status` is `unknown | running | pass | fail`. Readers reject unknown
   schema versions. About 200-300 bytes per file.
2. **Write cadence.** On every phase or gate change (event), plus a heartbeat
   every `heartbeat_s` (default 60) while a phase is long-running (pre-ship and
   CI take 15-45 minutes). Events give freshness, the heartbeat gives liveness;
   neither alone does both.
3. **Atomic writes.** Write `<TASK>.json.<pid>.tmp` in the same directory, then
   `rename` over the target. Readers see the old or the new file, never half of
   one. A reader that still meets a torn or foreign file treats it as `invalid`
   and polls.
4. **Watch mechanism.** None required. The orchestrator already wakes on its own
   cadence, so it reads the file (one small read) at those moments. `fs.watch`
   and chokidar add platform quirks on Windows for no gain while the
   orchestrator is itself woken by timers. Revisit only if the orchestrator ever
   becomes event-driven.
5. **Backwards compatibility.** Additive and off by default. Writing is a no-op
   unless `INTELLIFLOW_EXECUTOR_STATUS=1`. Reading returns `needsPoll: true`
   unless the file is `fresh` or `terminal`, so the orchestrator's existing
   polling path is unchanged and is what runs on any doubt. Migration is
   gradual: enable per fleet run, compare against polling, then decide.
6. **Crash resilience.** The reader computes freshness itself:
   `now - last_updated > 3 x heartbeat_s` means `stale`, which sends the
   orchestrator back to polling. A dead executor therefore degrades to today's
   behaviour instead of showing its last phase forever. `blocked` and `failed`
   are terminal and written by executors that can still write; `ready` and
   `merged` are terminal too.
7. **Multi-writer.** One file per task and one writer per file, so no locking. A
   second executor started on the same task shows up as a `pid` change and a
   `seq` that does not increase by one; that is a single-writer violation the
   orchestrator already treats as an incident (owner ledger rule).

### Where the files live

`<main clone>/.claude/executor-status/<TASK>.json`, resolved from any worktree
through `git rev-parse --git-common-dir`, so every executor and the orchestrator
agree on one directory. The directory is git-ignored (runtime state, never
committed). Override with `INTELLIFLOW_EXECUTOR_STATUS_DIR`. Task ids are
restricted to `[A-Za-z0-9][A-Za-z0-9_-]{0,63}` because they become file names.

### What is implemented now

`tools/scripts/lib/executor-status.mjs` (writer, reader, lister) and
`tools/scripts/executor-status.mjs` (CLI: `write`, `read`, `list`), both covered
by `tools/scripts/lib/executor-status.test.ts`. Nothing calls the writer
automatically: the executor prompt generator and the orchestrator guidance
mention it, but behaviour is unchanged until `INTELLIFLOW_EXECUTOR_STATUS=1` is
set and an executor chooses to call it.

### Positive Consequences

- A check costs about 200-300 bytes (roughly 60-80 tokens) instead of a slice of
  transcript. This is an estimate from the record size; the transcript-side cost
  was not measured here, so the issue's "measure token cost" item is still open.
- Liveness becomes observable (`seq`, `last_updated`) rather than inferred.
- Failure of the mechanism falls back to current behaviour.

### Negative Consequences

- Executors must actually call the writer; an LLM executor can forget, in which
  case the file goes stale and the orchestrator polls, which is the status quo.
- The file is self-reported. It is a progress hint only; Definition of Done
  still requires the git, CI and attestation checks in `orchestrator.md`.
- One more runtime directory on the host.

## Pros and Cons of the Options

### Option 1: keep polling

- Good, because it already works and needs no change.
- Bad, because cost scales with fleet size and transcript length.

### Option 2: per-task file with polling fallback

- Good, because reads are tiny and need no coordination.
- Good, because staleness is detectable and degrades to polling.
- Bad, because correctness of liveness depends on executors writing heartbeats.

### Option 3: single shared file or SQLite

- Good, because one read gives the whole fleet.
- Bad, because 15 writers contend on one resource and need locking; a torn write
  damages every task at once.

### Option 4: local HTTP or socket endpoint

- Good, because it is truly push-based and can carry events.
- Bad, because it needs a long-lived daemon on a host already short on memory,
  and its own death silences every executor at once.

## Links

- Issue #581 (this design), issue #578 (the pump/idle-time diagnostic that
  motivates cheaper, more frequent liveness signals)
- `.claude/agents/orchestrator.md`, "Driving sub-agent executors"
- Implementation: `tools/scripts/lib/executor-status.mjs`,
  `tools/scripts/executor-status.mjs`

## Implementation Notes

Open items, deliberately not done here:

- Wire the writer into the dispatch prompt so executors emit phase events.
- A small orchestrator-side loop that calls `read` before falling back to
  transcript reads, and a measured comparison of tokens per check.
- Decide on `Accepted` after one fleet run with the flag on.

### Validation Criteria

- [x] Disabled by default; no file or directory is created when off
- [x] Atomic publish leaves no temp files
- [x] Stale, torn, foreign-task and unknown-version files all send the reader to
      polling
- [x] Unsafe task ids cannot escape the status directory
- [ ] Measured tokens per check, polling versus file read
- [ ] One fleet run with `INTELLIFLOW_EXECUTOR_STATUS=1` and no regression

### Rollback Plan

Unset `INTELLIFLOW_EXECUTOR_STATUS` (the default). Nothing else depends on the
files; deleting `tools/scripts/executor-status.mjs` and the lib reverts the
change.
