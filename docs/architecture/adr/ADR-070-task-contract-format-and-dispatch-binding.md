# ADR-070 — Task-Contract Format, Dispatch-Binding Enforcement, and Lease Ledger Architecture

**Status**: Accepted **Date**: 2026-07-26 **Author**: Tech Lead (AUTOMATION-004
lease) **Related**: ADR-067 (metrics harness), ADR-068 (attestation provenance),
ADR-069 (rolling-wave rebaselining)

---

## Context

The autonomous delivery harness dispatches AI agents against Sprint tasks
through a 20-field task-contract communicated only as prose in agent prompts.
ORCH-001 recon (baseline `c0ee657df`) identified six gaps; Gap G2 (task contract
not schema-enforced) is the root cause of two recurring failure classes:

1. **L48-class binding violations**: an agent begins execution without a
   verified 4-way binding (taskId + sessionId + branch + worktree). Mid-task
   containment is expensive; ORCH-CLEANUP-001 cost ~45 minutes.
2. **Phantom completions**: agents self-attest "Completed" against acceptance
   criteria that are prose-only in the dispatch message, not machine-checkable.

This ADR makes three decisions:

1. **Task-contract format**: standardise the 20-field contract as a JSON Schema
   (Draft 2020-12). Every dispatch MUST produce a valid contract JSON before
   execution begins.
2. **Dispatch-binding enforcement**: a CLI guard (`verify-dispatch-binding.ts`)
   validates the 4-way binding before any task execution. The guard is a hard
   prerequisite; a failed check is a hard stop.
3. **Lease ledger architecture**: where active leases are durably stored so
   exactly one lease can be enforced per task across Linux orchestrator and
   Windows agents.

---

## Decision 1 — Task-Contract Format

**Standardise as JSON Schema (Draft 2020-12).** The schema lives at
`tools/scripts/orchestration/schemas/task-contract.schema.json` and is the
single canonical definition. All 20 required fields are typed:

| Field                       | Type                              | Purpose                                 |
| --------------------------- | --------------------------------- | --------------------------------------- |
| `taskId`                    | string                            | Unique task identifier (e.g. ORCH-002)  |
| `approvedOutcome`           | string                            | What this task delivers                 |
| `acceptanceCriteria`        | string \| string[]                | Machine-readable criteria               |
| `baselineMainSha`           | string (hex)                      | origin/main SHA at dispatch time        |
| `specHash`                  | string                            | SHA of spec file (integrity check)      |
| `policyVersion`             | string                            | Which policy revision applies           |
| `dependencySnapshot`        | string                            | Lockfile hash or dep snapshot reference |
| `riskClass`                 | enum: Low\|Medium\|High\|Critical | Risk classification                     |
| `priority`                  | enum: low\|medium\|high\|critical | Dispatch priority                       |
| `estimatedEffort`           | string                            | Human-readable estimate                 |
| `timeBudget`                | string                            | Max wall-clock time (e.g. "2h")         |
| `retryBudget`               | integer ≥0                        | Max retries on gate failure             |
| `validationProfile`         | string \| string[]                | Required gates before merge             |
| `expectedArtifacts`         | string[]                          | Paths of expected output files          |
| `branch`                    | string                            | Git branch name                         |
| `worktree`                  | string                            | Absolute worktree filesystem path       |
| `agentLeaseId`              | string                            | Unique lease ID for this dispatch       |
| `leaseExpiry`               | string (ISO 8601)                 | When the lease expires                  |
| `allowedMutationScope`      | string[]                          | Glob patterns of allowed mutations      |
| `humanEscalationConditions` | string \| string[]                | Conditions requiring human gate         |

**Rationale**: JSON Schema is widely supported, self-documenting, and enables
machine validation at any point in the pipeline. Draft 2020-12 is the current
stable version with full `$ref` + `$defs` support.

---

## Decision 2 — Dispatch-Binding Enforcement

**A CLI guard (`verify-dispatch-binding.ts`) is a hard prerequisite for every
dispatch.** The guard validates the 4-way binding:

```
taskId (contract) === taskId (supervisor intent)
agentLeaseId (contract) === sessionId (current Claude Code session)
branch (contract) === git rev-parse --abbrev-ref HEAD (in the worktree)
worktree (contract) === realpath(CWD of the executing agent)
```

Any mismatch exits 1 with a human-readable error. The supervisor MUST see exit 0
before the agent begins any file writes.

**Usage** (documented in `docs/operations/agent-autonomy-policy.md`):

```sh
npx tsx tools/scripts/orchestration/verify-dispatch-binding.ts \
  --contract .specify/sprints/sprint-19/spec/AUTOMATION-004/contract.json \
  --task-id AUTOMATION-004-task-contract-schema-and-dispatch-guard \
  --session-id local_28109fae \
  --branch fix/orch-002-task-contract-and-dispatch-guard \
  --worktree /c/Users/talys/projects/iflow-orch-002-contract-and-guard
```

**L48 recurrence prevention**: ORCH-CLEANUP-001 was triggered because an agent
(IFC-304 pre-ship) continued running after it was declared a duplicate of Slot
4's leased work. The 4-way binding guard makes this detectable at dispatch time:
if the contract's worktree and branch do not match the executing environment,
the guard blocks immediately, before any git or file writes occur.

---

## Decision 3 — Lease Ledger Architecture

### Requirements (Section 4 of owner directive)

The authoritative live lease store must satisfy all of the following:

| #   | Requirement                                                       |
| --- | ----------------------------------------------------------------- |
| R1  | Atomic compare-and-set lease acquisition                          |
| R2  | Exactly one active lease per task                                 |
| R3  | Idempotent append-only events                                     |
| R4  | Crash/restart recovery                                            |
| R5  | Cross-environment ownership (Linux orchestrator ↔ Windows agents) |
| R6  | Transactional concurrency                                         |
| R7  | Backup/export capability                                          |
| R8  | No secrets stored                                                 |
| R9  | No paid infrastructure                                            |

### Option A — Git-tracked JSONL as live lease store

A JSONL file (`tools/orchestration/leases.jsonl`) committed on every lease
event; agents read origin/main before acquiring.

| Req | Result | Reason                                                             |
| --- | ------ | ------------------------------------------------------------------ |
| R1  | ✗      | Two agents can race to push at the same moment; no server-side CAS |
| R2  | ✗      | Without R1, the exactly-one constraint cannot be enforced          |
| R3  | ✓      | Append-only with git history                                       |
| R4  | ✓      | Full git history available                                         |
| R5  | ✓      | Any environment with git + network                                 |
| R6  | ✗      | Git rebase required on conflict; not transactional                 |
| R7  | ✓      | Git history IS the backup                                          |
| R8  | ✓      | No credentials in the JSONL                                        |
| R9  | ✓      | No external service                                                |

**Verdict: REJECTED** as authoritative live lease store. R1, R2, R6 failures are
not patchable without adding external infrastructure. ACCEPTABLE as an audit
export / projection layer (append git event on lease acquire/release after the
fact, for human review). This is the role git-tracked JSONL plays in the
recommended hybrid.

### Option B — GitHub Issues API (free tier)

One GitHub Issue per task; issue state + labels represent lease state. Label
`lease:active` + assignee = the holding agent.

| Req | Result | Reason                                                                                                                      |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| R1  | ✗      | Label add (`POST /issues/{n}/labels`) is NOT atomic CAS — two concurrent calls can both return HTTP 200; no "add if absent" |
| R2  | ✗      | Without R1, exactly-one-active cannot be enforced; last writer wins on label state                                          |
| R3  | ✓      | Comments append events idempotently                                                                                         |
| R4  | ✓      | GitHub persists; network reconnect resumes                                                                                  |
| R5  | ✓      | Any environment with HTTPS + GITHUB_TOKEN                                                                                   |
| R6  | ✗      | Issue label mutations are not transactional; concurrent PATCH/POST requests are not serialised with CAS semantics           |
| R7  | ✓      | Issues API export; GitHub archive                                                                                           |
| R8  | ✓      | Only task IDs and status in issue body (no credentials)                                                                     |
| R9  | ✓      | Free tier; private repo                                                                                                     |

**Verdict: REJECTED** as authoritative live lease store. R1, R2, and R6 fail:
the GitHub Issues REST API uses last-writer-wins semantics for label updates.
Two supervisors racing to acquire a lease would both see success; there is no
server-side compare-and-set primitive on issue labels or assignees.

**Acceptable role**: audit / control projection — post a comment on the task
Issue on lease acquire/release, after the fact, for human review. This gives
observability without relying on the API for atomicity. This is the role Option
B plays in the hybrid recommendation below.

### Option C — Local SQLite file in `.orchestration/` (git-ignored, per-machine)

SQLite WAL mode file at `.orchestration/leases.db` on each machine.

| Req | Result | Reason                                                                            |
| --- | ------ | --------------------------------------------------------------------------------- |
| R1  | ✓      | `UPDATE ... WHERE status='available' RETURNING *` is atomic in SQLite WAL         |
| R2  | ✓      | `UNIQUE(task_id) WHERE status='active'` constraint                                |
| R3  | ✓      | Append-only events table                                                          |
| R4  | ✓      | SQLite WAL survives crashes                                                       |
| R5  | ✗      | Per-machine only; Linux orchestrator and Windows agents do not share a filesystem |
| R6  | ✓      | SQLite serialises writes                                                          |
| R7  | ✓      | Copy or export the .db file                                                       |
| R8  | ✓      | No credentials in the DB                                                          |
| R9  | ✓      | No external service                                                               |

**Verdict: REJECTED**. R5 (cross-environment) failure is fundamental — the Linux
orchestrator and Windows agent cannot share a local SQLite file. Might be viable
if the entire harness moved to a single machine, but the design goal is
cross-environment. Acceptable as a per-machine duplicate-lease cache (a
performance optimisation over the GitHub Issues query), not as the authoritative
source.

### Option D — File-lock + JSONL hybrid (advisory locks + append log)

Advisory `flock` on a shared JSONL file; each lease event appended; readers
rebuild state from the log.

| Req | Result | Reason                                                                                                                            |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| R1  | ✓      | `flock --exclusive` is atomic within a single machine                                                                             |
| R2  | ✓      | Lock ensures exactly one writer at a time                                                                                         |
| R3  | ✓      | Append-only JSONL                                                                                                                 |
| R4  | ✓      | If process holding flock crashes, lock is released; log reconstructible                                                           |
| R5  | ✗      | `flock` is OS-local; Windows agents use different locking primitives; cross-machine coordination impossible without network share |
| R6  | ✓      | Lock serialises writes per-machine                                                                                                |
| R7  | ✓      | Copy or tail the log                                                                                                              |
| R8  | ✓      | No credentials in the log                                                                                                         |
| R9  | ✓      | No external service                                                                                                               |

**Verdict: REJECTED**. Same R5 failure as Option C — flock does not span
machines. Further, Windows agents (`flock` is not natively available in
PowerShell; Git Bash has it, but interoperability with a Linux orchestrator
flock is not guaranteed across NFS or SMB shares).

### Summary of verdicts

| Option            | R1 (CAS) | R2 (one-active) | R5 (cross-env) | R6 (transactional) | Verdict               |
| ----------------- | -------- | --------------- | -------------- | ------------------ | --------------------- |
| A (git JSONL)     | ✗        | ✗               | ✓              | ✗                  | REJECTED (live lease) |
| B (GitHub Issues) | ✗        | ✗               | ✓              | ✗                  | REJECTED (live lease) |
| C (SQLite local)  | ✓        | ✓               | ✗              | ✓                  | REJECTED (live lease) |
| D (flock+JSONL)   | ✓        | ✓               | ✗              | ✓                  | REJECTED (live lease) |

**No evaluated option satisfies all 9 requirements for cross-environment use.**
Options A and B fail on atomic acquisition (R1/R2/R6). Options C and D fail on
cross-environment reach (R5). The root tension is: options with true atomicity
rely on per-machine OS primitives (SQLite WAL, flock); options that span
environments lack atomic primitives.

### Recommendation

| Layer                             | Store                                               | Rationale                                                                  |
| --------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| Authoritative live lease store    | **Not decided — AUTOMATION-005 scope**              | Requires a cross-env distributed lock primitive (see AUTOMATION-005)       |
| Per-machine duplicate-lease cache | Local JSONL in `.orchestration/active-leases.jsonl` | Fast local check on the same machine; does NOT guarantee cross-env CAS     |
| Audit/control projection          | GitHub Issues comments (Option B, reduced role)     | Human-readable history; observability only — never relied on for atomicity |
| Audit export                      | Git-tracked JSONL snapshot (Option A, reduced role) | Append-only history for human review; no CAS dependency                    |

**AUTOMATION-005 scope**: evaluate and implement a cross-env distributed lock
service. The project already runs **Upstash Redis** (confirmed in codebase
inventory: `"Cache enabled: true, Provider: Redis (Upstash)"`). Redis
`SET NX EX` provides atomic CAS, exactly-one-active enforcement, TTL-based lease
expiry, transactional concurrency, and cross-environment reach — satisfying all
9 requirements. This is the leading candidate. AUTOMATION-005 will evaluate this
and any alternatives before committing.

**AUTOMATION-004 (this task)** implements only the per-machine local JSONL cache
for duplicate-lease detection — the simplest enforcement that prevents the most
common class of same-machine duplicate-lease bugs without requiring the full
AUTOMATION-005 live store.

**Limitation of the per-machine JSONL cache**: `checkDuplicateLease` and
`lookupStoredLeaseForTask` read from disk on every call — they are NOT
in-memory-only and DO survive process restarts. However, they provide no
cross-environment atomic acquisition. Two supervisors on different machines (or
two concurrent processes on the same machine before either writes its lease
record) can both pass the local cache check and both proceed. The JSONL cache
catches the common case (same-machine sequential dispatches) but does NOT
guarantee exactly-one-winner under concurrent access. Cross-environment atomic
enforcement requires AUTOMATION-005 durable distributed lock (Upstash Redis
`SET NX EX`).

---

## Consequences

### Positive

- Every dispatch is machine-validated against a JSON Schema; prose drift no
  longer causes phantom completions.
- 4-way binding guard catches binding violations at dispatch time, eliminating
  L48-class mid-task containment.
- ADR-070 provides the architectural decision record so AUTOMATION-005 can
  implement the durable cross-env lease store without re-litigating the
  evaluation. Upstash Redis SET NX EX is the leading candidate for
  AUTOMATION-005 scope.

### Negative

- Every dispatch requires a contract JSON file to exist before execution.
  Lightweight tasks that previously started immediately now need 5–10 minutes of
  upfront contract authoring.
- `verify-dispatch-binding.ts` requires an explicit supervisor call per
  dispatch. This is intentional — the binding check cannot be automated away.

### Neutral

- The per-machine `.orchestration/active-leases.jsonl` is gitignored. It does
  not contribute to CI state. Its absence means the duplicate-lease check falls
  back to "no prior leases seen" (safe: false-negatives possible but no
  false-positives on valid dispatches).

---

## Rejected Alternatives

- **Prose-only contracts (status quo)**: already rejected by ENG-OPS-002/003
  hardening. The L48 incident and ghost-completion rate are the evidence.
- **Monolithic task-contract enforcement in a single PR**: splitting contract
  schema (AUTOMATION-004) from live lease store (AUTOMATION-005) keeps each PR
  independently reviewable and revertable. See ADR-070 rationale pattern from
  ADR-066 and ADR-068.
