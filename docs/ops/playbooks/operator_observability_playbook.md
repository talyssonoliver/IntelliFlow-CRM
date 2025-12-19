# IntelliFlow CRM Automation Suite — Operator UX, Observability, Resilience, and Control-Plane Improvements

(Discussion/implementation notes; environment-agnostic. Based on your current
“Swarm Manager + Orchestrator + validation.yaml” approach.)

## Objectives

- **Zero-black-box execution**: operators can see _what is happening_, _where it
  is stuck_, _why it failed_, and _what to do next_.
- **Runway-positive throughput**: maximize parallelism without causing cascading
  failures (rate limits, resource contention, flaky gates).
- **Deterministic shipping**: only ship when deterministic gates pass; always
  leave a forensic trail when they do not.
- **Fast recovery**: safe unlock/stop/retry paths; avoid wedged tasks and zombie
  agents.

---

## 1) Operator Experience: “What’s running, at what phase, and why”

### 1.1 Phase telemetry (must-have)

Add explicit, machine-readable phase state per task:

- `current_phase`: `PRE_FLIGHT`, `ARCHITECT_SPEC`, `ARCHITECT_PLAN`,
  `ENFORCER_TDD`, `BUILDER_ATTEMPT_n`, `GATEKEEPER_ATTEMPT_n`,
  `AUDITOR_ATTEMPT_n`, `COMPLETED`, `CRASHED`.
- `attempt`: integer retry count.
- `updated_at`: ISO timestamp.
- `last_log_line`: last N bytes (or pointer to log file offsets).

Where to store:

- A per-task JSON in `artifacts/status/<TASK>.json` is sufficient.
- Keep the format stable (schema) to enable future dashboard/CLI tooling.

### 1.2 Heartbeat (must-have)

A simple heartbeat file or field (`last_heartbeat_at`) updated at least every:

- 5–30 seconds for active tasks
- At every phase transition This enables:
- “stuck detection” and safe remediation
- Monitoring without parsing huge logs

### 1.3 Human-readable “runbook summary” per task (should-have)

Generate a short `artifacts/reports/<TASK>.md` on every failure with:

- Phase where it failed
- Exit code + top-level reason (validation command / audit rejection / agent
  error)
- Pointers to logs + last 200 lines
- Next action: “edit spec”, “fix gate”, “rerun”, “mark blocked”

---

## 2) Live visibility while agents run

### 2.1 Stream logs without losing structured history

Problem: background execution + log redirection hides progress.

Recommended pattern:

- Always write full logs to file (per task + aggregate).
- Optionally stream a prefixed view to console:
  - prefix each line with `[TASK_ID]` and (optional) `[PHASE]`
  - use line-buffering (`stdbuf -oL -eL` or equivalent) to avoid “bursty” output

### 2.2 “Attach” mechanics

Provide operator commands (shell scripts are fine):

- `status`: list active tasks, phase, PID, heartbeat age, log path
- `watch <task>`: tail -F the task log
- `watch swarm`: tail -F the aggregate log
- `explain <task>`: render a concise summary from status + last log lines

If your team uses tmux:

- spawn each agent in a named tmux session:
  - `tmux new -d -s task-<ID> <command>`
- operator can `tmux attach -t task-<ID>` (best UX; no interleaving)
- logs still go to file for postmortems

---

## 3) Control plane: stop, unlock, retry—safely

### 3.1 Stop semantics (must-have)

Add explicit stop actions:

- `stop <task>`:
  - send SIGTERM; wait N seconds; SIGKILL if needed
  - record “STOPPED_BY_OPERATOR” in status
  - release lock only when process is confirmed dead

### 3.2 Unlock semantics (must-have)

Avoid naive “delete lock if > 60 minutes” unless you also confirm PID liveness.
Best practice:

1. Check PID exists and belongs to expected command.
2. If dead → remove lock.
3. If alive but “stuck” (no heartbeat for threshold) → escalate:
   - snapshot diagnostics
   - attempt graceful stop
   - then remove lock

### 3.3 Watchdog (should-have; use carefully)

Automated stuck remediation:

- If heartbeat age > threshold:
  - collect diagnostics (see §6)
  - stop process
  - set status to `Needs Human` (or `Failed`) with reason `WATCHDOG_STUCK`
  - release lock

Use conservative thresholds initially (e.g., 15–30 minutes) and tune once you
have baseline timings.

---

## 4) Make retries predictable and non-destructive

### 4.1 Retry taxonomy

Different failure types need different retry behaviors:

- **Transient**: API rate limit, network, model timeout → retry with backoff +
  jitter.
- **Deterministic gate failure**: tests fail, lint fails → no “blind” retry;
  instead:
  - feed error context to Builder once per attempt
  - after N attempts → Needs Human
- **Audit rejection**: treat as deterministic; require plan/spec changes or code
  changes before retry.
- **Spec/Plan missing (“ghost file”)**: immediate Needs Human (or re-run
  Architect once) with clear remediation.

### 4.2 Backoff and jitter

Use exponential backoff with jitter for external calls to avoid synchronized
storms:

- base: 5–10 seconds
- factor: 2
- cap: 60–120 seconds
- jitter: ±20–30%

### 4.3 Idempotency

Every phase should be idempotent:

- If spec/plan exists and is newer than the task start time, don’t regenerate
  unless forced.
- If tests exist, only regenerate when spec changed.
- Validation and audit should be re-runnable without side effects.

Add flags:

- `--force-spec`, `--force-plan`, `--force-tests`, `--force-audit`.

---

## 5) Deterministic gates: align YAML “intent” with actual behavior

### 5.1 Respect gate types

If you have `type: auto|manual|conditional`, your runner should enforce it:

- `auto`: always run
- `manual`: do not run; record required manual action in artifacts
- `conditional`: run only when `required: true` or when env flag enabled (e.g.,
  `RUN_CONDITIONAL=1`)

### 5.2 KPI checks are only useful if enforced

If YAML declares `kpi_checks`, implement:

- a metrics file contract (e.g., `artifacts/metrics/<TASK>.json`)
- gate logic to evaluate thresholds Otherwise, remove KPI checks from YAML to
  avoid false confidence.

### 5.3 Make test execution explicit

TDD is not “real” unless gates run the tests. Options:

- global: run full unit suite (slow; reliable early on)
- targeted: map task → workspace/package → run only impacted tests
- enforce minimum: “generated tests must be placed in correct package and
  executed”

---

## 6) Forensics: always capture diagnostics on failure/stuck

When a task fails or is killed by watchdog/operator:

- save:
  - `ps` info for PID (command line, CPU, RSS)
  - open files (if available)
  - tail of task log (200–500 lines)
  - tail of validation log (if separate)
  - the exact gate command that failed + exit code + captured stdout/stderr
- store in `artifacts/forensics/<TASK>/<timestamp>/...`

This is the difference between 2-minute triage and multi-hour guesswork.

---

## 7) Security hardening (low-effort, high-value)

### 7.1 Secret scanning

Current regex-based grep is better than nothing, but you will miss formats and
create false positives. Improvements:

- use a dedicated scanner (e.g., gitleaks/trufflehog) in CI and optionally
  locally
- keep regex grep as a fast pre-check but do not rely on it as primary security
  control
- ensure scanner excludes known-safe fixtures but does not blanket-exclude large
  directories

### 7.2 Execution sandboxing

Your Builder phase runs arbitrary code changes + commands. Add containment:

- run gates in ephemeral containers where feasible
- restrict network access during tests (or allowlist)
- prevent writing outside repo root
- avoid exposing env vars to subprocesses unless necessary (principle of least
  privilege)

### 7.3 Supply chain controls

For `pnpm install` and build tooling:

- lockfile must be present and validated
- use `pnpm fetch`/offline store patterns for repeatability
- run `pnpm audit` (or equivalent) as a periodic gate; don’t block every task
  unless required

---

## 8) Reliability of orchestration scripts (shell pitfalls to eliminate)

### 8.1 Beware `set -e` causing silent premature exits

Common failure mode:

- a command fails inside a phase → script exits immediately → no status update →
  lock remains → task appears “hung”. Mitigations:
- wrap external calls in explicit error handling blocks
- add `trap` on EXIT to mark status if not Completed
- ensure lock cleanup happens on all exits (including signals)

### 8.2 CSV updates must be robust

CSV fields often contain commas and quotes. `awk -F','` will corrupt the file.
Use a real CSV parser (Python `csv` module) for status updates.

### 8.3 Timeouts everywhere

Any external call can hang:

- model calls (curl)
- `pnpm` / build
- docker compose
- lint/test Implement:
- per-command timeouts in validation runner
- phase timeouts with escalation policy

---

## 9) Resource management: keep throughput high without self-DOS

### 9.1 Concurrency controls by resource class

Two “agents” might still oversubscribe:

- CPU, memory, disk I/O
- docker daemon
- pnpm store lock contention Add dynamic concurrency:
- separate pools: `BUILD_POOL`, `TEST_POOL`, `DOCKER_POOL`, `AI_POOL`
- prevent multiple heavy docker phases concurrently if your host can’t handle it

### 9.2 Rate limiting for model APIs

Parallel tasks can hit provider rate limits. Add:

- token budget per hour/day
- request concurrency semaphore per provider
- backoff on 429/5xx

---

## 10) Quality gates aligned with your engineering standards

Given your desired standards (Hexagonal, DDD, TDD, Sonar A, coverage ≥90%):

- enforce a minimal “definition of done” per task:
  - unit tests present and passing
  - lint/format check
  - types check
  - security scan baseline
- ensure “task complete” means “merge-ready” and “deployable to staging”

If you have CI/CD:

- treat the orchestrator as _local factory_, CI as _final arbiter_.
- orchestrator should never mark Completed if CI would fail for deterministic
  reasons.

---

## 11) Governance: ADRs and change control

### 11.1 ADR automation (should-have)

Every architectural change should generate/append an ADR:

- title, context, decision, consequences
- link to tasks and specs
- done automatically by Architect or Auditor phase when “architectural impact”
  detected

### 11.2 Constitution versioning

Treat “Constitution” as versioned policy:

- change requires PR review
- include “why” and “effective date”
- auditors should reference the constitution version used for approval

---

## 12) Suggested implementation roadmap (incremental, low risk)

### Phase A — Observability MVP (1–2 days)

- per-task phase status + heartbeat
- `status/watch/stop` commands
- EXIT trap marks Needs Human on crash
- stream logs optionally

### Phase B — Safe recovery (1–3 days)

- watchdog with diagnostics snapshot
- robust PID/lock ownership verification
- remove “age-only lock deletion”

### Phase C — Gate semantics + TDD enforcement (2–5 days)

- implement YAML `type` semantics
- implement KPI checks or remove them
- ensure tests are executed deterministically

### Phase D — Hardening (ongoing)

- structured event logs (JSONL)
- tmux attach support
- sandboxing + supply chain controls
- concurrency pools + rate limiting
- ADR automation

---

## “Anything else?” — Additional high-leverage improvements

1. **Structured events (JSONL)**: every phase transition and gate result emits
   one line; enables dashboards without log parsing.
2. **Task dependency visualization**: generate a DAG (graphviz) from registry;
   operators see critical path and blockers.
3. **Failure clustering**: categorize failures by signature (same validation
   command, same stack trace) to avoid repeated manual triage.
4. **Spec quality linting**: before Enforcer/Builder, run a spec linter:
   - acceptance criteria present
   - non-functional requirements stated (perf, security, boundaries)
   - explicit test strategy
5. **Cost/latency KPIs**: track per task:
   - model calls count, tokens, duration
   - validation time
   - retry count
   - “time-to-human” for failed tasks
6. **“Dry run” mode**: generate spec/plan/tests only, no code changes; useful
   for reviewing before builder touches repo.
7. **Quarantine mode**: tasks failing repeatedly are quarantined; require
   spec/prompt change before re-eligible.

---

## Practical checklists

### Operator checklist

- Can I see active tasks and phases in one command?
- Can I attach to a single task’s live output?
- Can I stop a single task without restarting the swarm?
- If a task crashes, do I get a reason + next action within 60 seconds?

### Resilience checklist

- Are all external calls bounded by timeouts?
- Do we always update status on failure (including signals)?
- Are locks released only when process is confirmed dead?
- Are retries separated by failure type (transient vs deterministic)?

### Quality checklist

- Do gates run the tests (not just generate them)?
- Do gates respect manual vs auto checks?
- Are KPI checks real enforcement or just documentation?

---
