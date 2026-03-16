---
name: task-code-audit
description: |
  Audit a single IntelliFlow CRM task implementation against its `/spec-session`, `/plan-session`, and `/exec` artifacts, with the focus on code risk rather than pipeline mechanics. Use when the user asks to audit a task, review a TASK-ID implementation, verify whether a task's code is actually correct, or check for vulnerabilities, maintainability problems, hidden logical errors, hallucinated assumptions, unsafe casts, data-handling bugs, architectural drift, pattern inconsistency, or performance/resource inefficiencies.
---

# Task Code Audit

Audit one task's real implementation. Use the task's spec, plan, and exec artifacts to learn the intended behavior and claimed scope, then inspect the code and tests to decide whether the task is actually sound.

## Workflow

### 1. Resolve task context

- Read the task from the split sprint-plan files, not the full `Sprint_plan.csv`. Use [references/task-context.md](references/task-context.md).
- Record the task's sprint, description, dependencies, status, artifacts, and validation method.
- Load the task's specification, plan, and latest exec evidence if they exist.
- Extract acceptance criteria, invariants, planned file paths, runtime callers, legacy replacement expectations, and regression suites from those artifacts.

### 2. Build the audit scope from code

- Read the implementation files named in the plan or delivery report, then expand to direct callers, callees, schemas, validators, tests, and container wiring when relevant.
- Read the nearest available `AGENTS.md`. In this repo that is usually the root [AGENTS.md](/C:/Users/talys/projects/intelliFlow-CRM/AGENTS.md), but use a deeper one if it exists in the touched area.
- Prefer real runtime paths over helper files that are never called.

### 3. Audit code, not workflow

- Do not fail a task only because CSV status, percent-complete, attestation formatting, or other pipeline-only metadata is wrong.
- Do flag code issues that the workflow artifacts expose:
  - a spec/plan requires a real caller but the new code is unreachable
  - a legacy path still owns the behavior the task claimed to replace
  - delivery claims contradict the implementation or tests
  - regression coverage is too weak to support the code's correctness claims

### 4. Report findings

- Findings come first, ordered by severity.
- Every finding needs code evidence and a concrete failure mode.
- Separate confirmed defects from inferences or open questions.
- If no issues are found, state that explicitly and mention residual risk or unverified areas.

## Required Audit Lenses

- Logical correctness and hallucinated assumptions: compare spec invariants, schemas, DTOs, Prisma/domain types, and code paths. Flag invented fields, impossible states treated as valid, incorrect edge-case handling, or business rules that the code silently changes.
- Type safety and unsafe casts: inspect `any`, `unknown`, `as`, double-casts, non-null assertions, weak generics, and test/mocking patterns that bypass real contracts.
- Security and data handling: inspect validation, auth and tenant boundaries, sanitization and encoding, secret or PII exposure, error leakage, serialization, and unsafe trust of client input.
- Architecture and maintainability: inspect DDD and hexagonal boundaries, naming and pattern drift, misplaced logic, container wiring, duplicated logic, and divergence from existing repo conventions.
- Performance and resource efficiency: inspect over-fetching, N+1 queries, unnecessary rerenders, repeated expensive work, serial awaits, cache misuse, large payloads, and unbounded loops or allocations.

Use [references/audit-rubric.md](references/audit-rubric.md) for detailed failure patterns and layer-specific checks.

## Evidence Rules

- Cite the task artifact that created the expectation when relevant: spec acceptance criteria, plan step, delivery claim, or attestation note.
- Cite the implementation or test file that proves the issue.
- Prefer repository evidence over generic best practice. If local conventions differ from generic advice, follow the repo.
- Treat missing proof as an open question, not a finding.

## Output Format

```markdown
## Findings

1. High - Hidden logical error in ...
- Evidence: spec/plan expected X; code at path:line does Y
- Impact: ...
- Fix: ...

2. Medium - Unsafe cast masks nullable ...
- Evidence: ...
- Impact: ...
- Fix: ...

## Open Questions
- ...

## Summary
- Audited task: TASK-ID
- Artifact coverage: spec yes/no, plan yes/no, exec yes/no
- Residual risk: ...
```

## Anti-Patterns

- Treating "tests pass" as proof of correctness when runtime code, schemas, or types disagree.
- Reporting generic lint or style nits instead of task-scoped code risk.
- Calling something secure because validation exists somewhere while the real entrypoint bypasses it.
- Accepting stub-only or unreachable code because a file exists.
- Assuming the spec or plan is correct when the implementation and surrounding code prove otherwise.
