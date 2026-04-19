# WIP Policy — IntelliFlow CRM

**Purpose**: Define and enforce Work-In-Progress (WIP) limits to reduce context
switching, keep throughput predictable, and prevent “almost done” work from
lingering across sprints.

---

## Goals

- Reduce context switching — finishing is faster than parallel starting
- Keep throughput predictable — small, completed batches over large in-flight
  queues
- Expose bottlenecks early — WIP pile-up signals a real systemic problem
- Avoid “almost done” stagnation — incomplete work has zero delivered value

---

## WIP Limits by Role

| Role                        | Max In-Progress Tasks | Notes                                             |
| --------------------------- | --------------------- | ------------------------------------------------- |
| Individual contributor (IC) | 1–2                   | Prefer 1; 2 only if one is blocked with no action |
| Engineering lead            | 2–3                   | Includes review + own work                        |
| PM / project owner          | 3–4                   | Discovery + delivery tasks counted separately     |

A task counts as “in-progress” when its Sprint_plan.csv `Status` is
`In Progress`.

---

## Rules

### Starting Work

1. **Finish before starting**: Before picking up a new task, complete or hand
   off the current one.
2. **Check WIP limit first**: If you are already at your limit, pull a blocked
   item through, not a new task.
3. **Prefer the highest-priority unblocked task** from the sprint backlog.

### Blocked Work

4. **Blocked work must have**: (a) a written blocker description in the task
   JSON, (b) a named owner who will resolve it, (c) a follow-up date.
5. Blocked tasks count toward your WIP limit until they are reassigned or
   resolved.
6. **Do NOT silently defer** a task as “blocked” without confirming the
   dependency is genuinely unfinished. Check the codebase and Sprint_plan.csv
   status first.

### Reviews

7. Code reviews count as in-progress work. An IC reviewing a PR is temporarily
   at +1 WIP. Reviews must be completed promptly (within 1 business day) so the
   author's WIP can close.

### End of Sprint

8. Any task still “In Progress” at sprint end is flagged in the sprint
   retrospective.
9. Carryover tasks must be re-estimated — they may have grown or changed scope.

---

## Signals That WIP Limits Are Being Violated

- Sprint board has >3 “In Progress” tasks per person
- Same task has been “In Progress” for >3 days without a commit or evidence
  update
- Blocked tasks have no named owner or follow-up date
- PR queue is growing (reviews are being deferred in favour of new tasks)

---

## Escalation

If a team member is consistently blocked or exceeding WIP limits due to external
dependencies, escalate to the Engineering Lead immediately — do not silently
absorb the blockage.

---

## TODO: to be authored

- Automated WIP dashboard integration with project-tracker metrics
- Sprint ceremony process for reviewing WIP violations in retrospective
- Policy for shared/cross-team dependency blocking

---

**Owner**: Engineering Lead + PM  
**Last reviewed**: 2026-04-16  
**Related**: `docs/operations/ticket-sizing.md`,
`docs/operations/abc-classification.md`, `docs/operations/project-playbook.md`
