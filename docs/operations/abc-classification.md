# ABC Classification — IntelliFlow CRM

**Purpose**: A triage framework for prioritizing work by business impact, not by
recency or vocal pressure. Classification is assigned during planning and
reviewed at sprint retrospective.

---

## Classification Tiers

### A — Must Ship

Work that directly blocks revenue, safety, compliance, or production stability.

**Criteria** (any one qualifies):

- Security vulnerability or compliance gap in a shipped system
- Production breakage or P1/P2 incident root cause
- Core customer value on the critical path to the next decision gate
- Revenue-blocking regression (payment, auth, data loss)

**Expected response**:

- Enters next sprint or current sprint immediately (interrupt if necessary)
- All other in-progress work may be paused
- Requires A-level review depth — two reviewers, explicit sign-off

### B — Important

Work that measurably improves experience, reliability, or developer velocity,
and enables future A-class work.

**Criteria**:

- Resolves a user-reported friction point or slow degradation
- Reduces technical debt blocking planned features
- Adds observability or coverage that catches future regressions
- Enables a sprint dependency for upcoming A-class work

**Expected response**:

- Scheduled in the next 1–2 sprints based on WIP capacity
- Standard review process

### C — Nice to Have

Work that is worthwhile but not time-sensitive and doesn't block other work.

**Criteria**:

- Visual polish, non-critical UX improvements
- Code cleanup and refactors with no functional change
- Documentation improvements not blocking any workflow
- Exploratory research with no immediate sprint dependency

**Expected response**:

- Scheduled opportunistically (end of sprint, slow periods)
- Can be deferred indefinitely without harm

---

## Classification Rules

1. **Classify at planning time** — do not retroactively bump to A during
   execution unless a new incident or compliance finding justifies it.
2. **Do not use C to defer B work indefinitely** — review C items quarterly and
   either promote, defer with a date, or delete.
3. **All sprint tasks must have a classification** in the `Sprint_plan.csv`
   `Priority` column (values: `A`, `B`, `C`).
4. **ABC is about impact, not effort** — a 2-hour fix can be A; a 5-day feature
   can be C.

---

## Relationship to Ticket Sizing

| Classification | Typical size | Action                                         |
| -------------- | ------------ | ---------------------------------------------- |
| A              | Any          | Must enter sprint, may interrupt current work  |
| B              | M or L       | Schedule in capacity planning                  |
| C              | S or XS      | Queue for opportunistic slots                  |
| C              | L or XL      | Decompose or delete — C-class XL is a red flag |

See `docs/operations/ticket-sizing.md` for size definitions.

---

## TODO: to be authored

- Governance process for re-classifying tasks during a sprint
- Stakeholder communication template when A-class work interrupts a sprint
- Quarterly C-item review ceremony process

---

**Owner**: Engineering Lead + PM  
**Last reviewed**: 2026-04-16  
**Related**: `docs/operations/ticket-sizing.md`,
`docs/operations/wip-policy.md`, `docs/operations/project-playbook.md`
