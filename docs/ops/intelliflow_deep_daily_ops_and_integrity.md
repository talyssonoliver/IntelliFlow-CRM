# IntelliFlow Day-to-Day Operating Model

How to ensure completed work matches the development plan, detect
drift/overengineering, prevent “fake green”, and surface engineering debt.

## 1) Core principle: trust is earned by evidence

Treat every task outcome as **a claim** until it has an **Evidence Pack**.
Automation produces artifacts; humans verify sufficiency and intent.

### Evidence Pack (required per task)

Minimum set that must exist and be reviewable:

- Spec: `.specify/specifications/<TASK>.md`
- Plan: `.specify/planning/<TASK>.md`
- Generated tests (if any): `tasks/<TASK>_generated.test.ts` (or where you
  relocate them)
- Validation output and timestamps: `logs/...` and
  `artifacts/status/<TASK>.json`
- Audit output (if enabled): `tasks/<TASK>_audit.log` (or equivalent)
- Code change reference: PR/commit hash + diff
- ADR link (only if architecture/API/infra choices changed)
- “Exceptions” record (if any gates were skipped/waived)

Operational rule: **Completed without Evidence Pack is not Completed.**

---

## 2) Daily cadence (deep day-to-day)

A suggested rhythm that scales with team size.

### Start of day (15–30 min)

1. **State integrity check**

- Registry is current vs plan of record (CSV changes accounted for).
- Docs grounding present (prevents generic Specs).
- No duplicate managers; no orphan agents.
- Locks consistent with live PIDs and fresh heartbeats.

2. **Build today’s execution plan**

- Bucket tasks: Running / Stuck / Needs Human / Blocked / Ready.
- Set WIP cap.
- Prioritize:
  - unblockers (highest fan-out)
  - then smallest/high-confidence tasks
  - defer tasks that depend on unstable prerequisites

3. **Quality focus decision**

- If “Needs Human” queue is rising: pause new starts and fix systemic causes
  (docs, gates, flaky commands).

### Midday (30–60 min total, split across day)

4. **Evidence review of yesterday’s “Completed”** You are not re-reading
   everything. You are sampling for correctness and drift.

- Review _all_ completed unblockers (fan-out tasks).
- Randomly sample 10–20% of other completed tasks (higher if the system is newly
  changed).
- For each reviewed task, apply the Acceptance Checklist (Section 3).

5. **Operate the factory**

- Keep Running tasks progressing.
- Process Needs Human tasks using “fix earliest defect” (Spec → Plan → Gates →
  Code → Env).
- If a repeated failure pattern appears: treat as an incident and fix at the
  gate/tooling layer once.

### End of day (10–20 min)

6. **Handoff snapshot**

- Completed today: list IDs.
- Needs Human: list IDs + root cause category + next action.
- Top blockers: list.
- Any waived gates/exceptions: list with expiry date and owner.

---

## 3) Acceptance Checklist (detect plan mismatch, wrong work, overengineering)

Use this checklist before you treat a task as “done-done”.

### A) Plan alignment (Spec/Plan ↔ Code)

- Does the code implement the Spec’s _explicit acceptance criteria_?
- Does the Plan’s sequence match what was actually changed?
- Any new behavior not described in Spec/Plan?
  - If yes: either update Spec/Plan (if intended) or revert (if accidental).

### B) Scope control (overengineering detection)

Flags that usually indicate overengineering:

- New abstractions created with only one implementation and no near-term reuse.
- New generic frameworks/utilities with no immediate consumers.
- New infra/services added when a configuration change would suffice.
- “Big refactor” touched unrelated areas to deliver a small feature.

Required action when flagged:

- Record as “Scope expansion” with rationale.
- Convert into ADR (why it was necessary) or remove it.

### C) Test integrity (prevent fake green)

- Tests exist and are executed (not only generated).
- No `--passWithNoTests` masking missing tests.
- No disabled suites, skipped assertions, or placeholder expects.
- Tests assert behavior (domain rules) not implementation details.

### D) Architecture integrity (Hexagonal/DDD)

- Domain logic stays in domain; no framework leakage.
- Adapters are thin (I/O, mapping, calls out).
- Ports are explicit contracts; no direct imports from adapters into domain.
- Aggregates enforce invariants; repositories are interfaces at the port
  boundary.

### E) Non-functional requirements (security/perf)

- No secrets, no new unsafe patterns.
- No new unbounded retries/loops; timeouts and backoff are explicit.
- Any new external calls have circuit-breaker/timeout semantics.

Outcome states:

- **Accepted**: matches plan, scoped, tested, architecture clean.
- **Accepted with Debt**: shipped but has recorded debt (see Section 6).
- **Rejected**: incorrect or unsafe; move to Needs Human with reason.

---

## 4) Detecting missing plan items (plan completeness)

The plan is “missing something” when you see any of:

- Repeated validation failures due to undeclared prerequisites.
- Manual steps being performed repeatedly across tasks.
- Multiple tasks needing the same undocumented config changes.
- “Surprise” refactors across tasks to patch structural holes.

How to respond:

1. Treat it as a planning defect, not an implementation defect.
2. Update:

- the shared docs grounding (canonical stack practices),
- the Constitution (non-negotiables),
- validation gates (deterministic checks),
- and optionally add a new “foundation task” to formalize the missing step.

Rule: **If the same missing step occurs twice, it becomes a first-class artifact
(doc/gate/task).**

---

## 5) Detecting agents “doing something wrong”

This includes incorrect assumptions, hallucinated APIs, or code that passes
gates but is not correct.

### Signals

- Spec/Plan contains vague language (“should”, “maybe”, “try”) instead of
  acceptance criteria.
- Code introduces APIs not present in your stack/docs.
- Audit says APPROVED but code contradicts repository conventions.
- Validation passes because gates are weak, not because behavior is correct.

### Countermeasures

- Strengthen Spec template: require “Given/When/Then” acceptance criteria.
- Add “API reality checks”:
  - forbid unknown imports
  - run TypeScript typecheck and build
  - enforce dependency rules (domain cannot import adapters)
- Add a human review step for unblockers and any task that changes architecture.

---

## 6) Debt detection and debt ledger (stop debt from hiding)

Debt appears when you accept results “for now” without a structured record.

### Debt sources you should explicitly track

- Gate waivers (security scan exceptions, audit bypasses).
- Flaky validations (intermittent failures).
- Skipped tests or “pass with no tests” allowances.
- TODO/FIXME notes, commented-out code paths.
- “Temporary” abstractions that became permanent.
- Performance regressions and missing benchmarks.

### Debt ledger workflow

Create a single ledger (e.g., `artifacts/debt-ledger.md` or a ticket board) with
fields:

- Debt ID
- Origin task ID(s)
- Category (security / architecture / tests / build / docs / performance)
- Severity
- Owner
- Expiry date (mandatory)
- Remediation plan
- Link to evidence (logs/PR)

Operational rule: **No expiry date = not acceptable debt.**

---

## 7) “Fake results” prevention (green without truth)

Common causes:

- gates that echo success on failure paths
- commands marked manual but still executed, always exiting 0
- validations that do not actually run tests/builds
- stale artifacts from previous runs

Hardening strategies (workflow-level, not code-specific):

- Treat logs as append-only and timestamped; new run writes a new run-id.
- Require a per-task “run attestation”:
  - when task started
  - which gates ran
  - which tests ran
  - which commit hash
- Reject “Completed” if attestation missing.

---

## 8) Audit strategy: what humans check (lightweight but effective)

Do not review everything deeply every day. Review **the right things**.

### Daily review set

- All tasks that unblock others (fan-out).
- All tasks touching auth/security, infra, CI/CD, build tooling.
- Random sample of other completed tasks (10–20%).

### Weekly review set

- Any task that introduced a new abstraction/module.
- Any task with waivers or “Accepted with Debt”.
- Any recurring failure pattern in Needs Human.

---

## 9) Metrics that tell you if the factory is healthy

Track these daily:

- Throughput: completed/day
- Needs Human rate: (Needs Human / started)
- Rework rate: (% completed later rejected)
- Mean time to intervention: time from Needs Human → rerun queued
- Gate stability: failures by gate (top 3)
- Debt inflow vs outflow: new debt items vs closed debt items

Interpretation:

- High throughput + high rework = fake progress.
- High Needs Human rate = plan/gates/docs grounding weak.
- Debt inflow > outflow for 2+ weeks = quality will collapse later.

---

## 10) Practical “operator questions” to ask each morning

Use these to keep alignment and prevent drift:

- Which tasks completed yesterday are **unblockers** and must be verified today?
- Are we fixing **systemic** issues or patching individual tasks repeatedly?
- What debt did we accept yesterday, and when will it be removed?
- Are we starting new work while the Needs Human queue is growing?
- Did any task change architecture without an ADR?

---

## Quick templates

### Task Acceptance Record (one paragraph)

- TASK: <id>
- Verdict: Accepted / Accepted with Debt / Rejected
- Evidence: <spec+plan+logs+PR>
- Notes: <one-liner>

### Debt Record (one paragraph)

- DEBT: <id> from TASK <id>
- Category/Severity:
- Expiry:
- Remediation:
- Link:
