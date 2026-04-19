# Ticket Sizing — IntelliFlow CRM

**Purpose**: A shared vocabulary for estimating task effort so the sprint plan
reflects realistic throughput, not optimistic guesses. Sizing is done during
spec or plan session — not retroactively.

---

## Size Buckets

| Size | Effort     | Definition                                        | Sprint Plan field |
| ---- | ---------- | ------------------------------------------------- | ----------------- |
| XS   | < 2 hours  | Pure config change, 1-file edit, doc update       | `”XS”`            |
| S    | ≤ 0.5 day  | Single-concern change, low uncertainty            | `”S”`             |
| M    | 0.5–2 days | Well-understood feature, 2–5 files touched        | `”M”`             |
| L    | 2–5 days   | Multi-layer change (API + DB + UI); split if able | `”L”`             |
| XL   | > 5 days   | Must be decomposed before sprint entry            | `”XL”` (blocked)  |

XL tasks **may not enter a sprint** as a single task. Break them into L + M
sub-tasks first.

---

## Sizing Dimensions

Size by the **combination** of:

1. **Scope** — how many layers are touched (domain / application / adapter /
   UI)?
2. **Uncertainty** — do we know the full approach, or is discovery needed?
3. **Integration complexity** — external services, migrations, schema changes?
4. **Test surface** — how many test cases are needed to reach ≥90% coverage?

A technically simple task with high uncertainty is still **M** or higher.

---

## Splitting Rules

| Signal                                   | Action                                      |
| ---------------------------------------- | ------------------------------------------- |
| “I don't know exactly what it needs yet” | Add a spike task (XS or S) before the impl  |
| Task touches >3 layers                   | Split by layer (backend task + UI task)     |
| Task has >2 acceptance criteria          | Consider splitting by criterion             |
| Estimated at L but requirements unclear  | Downgrade to spike; re-estimate after spike |

Spikes use the `EXC-*` or `IFC-*` prefix with a `-spike` suffix in the title.
Spike output is a written spec or ADR, not code.

---

## Common Pitfalls

- **Undersizing integrations**: Touching Prisma schema is always +0.5 day
  (migration
  - regeneration + adapter updates).
- **Ignoring test time**: Tests often take 30–50% of implementation time.
- **”XL, but we can start it”**: No. Decompose first — an XL task entered as-is
  will stall and carry over.
- **Retroactive resizing**: Don't resize a task after it starts — update
  estimates in the sprint retrospective instead.

---

## Relationship to ABC Classification

Sizing is about **effort**. ABC classification (see
`docs/operations/abc-classification.md`) is about **priority**. A small task can
be A-priority; a large task can be C. Don't conflate the two.

---

## TODO: to be authored

- Velocity tracking and capacity planning based on historical sizing accuracy
- Per-sprint sizing review ceremony process
- Integration with Sprint_plan.csv `Effort` column

---

**Owner**: Engineering Lead + PM  
**Last reviewed**: 2026-04-16  
**Related**: `docs/operations/wip-policy.md`,
`docs/operations/abc-classification.md`, `docs/operations/project-playbook.md`
