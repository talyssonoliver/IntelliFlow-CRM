# ORCH-002 Execution Plan

**Task ID**: ORCH-002-task-contract-schema-and-dispatch-guard
**Sprint**: 19
**Baseline SHA**: `1810a937137adf4b8410eac1719500ea3558ac3b`

---

## Execution Steps (this task)

- [x] 1. Worktree created: `../iflow-orch-002-contract-and-guard/` off `1810a937`
- [x] 2. Dedup verified: grep for ORCH/harness rows across all Sprint_plan_*.csv → zero matches
- [x] 3. ADR number confirmed: ADR-069 is "rolling-wave-rebaselining" → next is **ADR-070**
- [x] 4. Spec written (this file's sibling: spec.md)
- [x] 5. Plan written (this file)
- [ ] 6. ADR-070 authored — evaluates ≥4 ledger options; names winner
- [ ] 7. `tools/scripts/orchestration/schemas/task-contract.schema.json` — 20-field JSON Schema
- [ ] 8. `tools/scripts/orchestration/validate-task-contract.ts` — validator module + CLI
- [ ] 9. `tools/scripts/orchestration/__tests__/validate-task-contract.test.ts` — test suite
- [ ] 10. `tools/scripts/orchestration/verify-dispatch-binding.ts` — dispatch-binding guard CLI
- [ ] 11. `docs/operations/agent-autonomy-policy.md` — dispatch-binding section appended
- [ ] 12. `Sprint_plan.csv` — ORCH-002 row appended; splits regenerated
- [ ] 13. Scoped unit tests: `npx vitest run tools/scripts/orchestration/__tests__/`
- [ ] 14. TypeScript check: `npx tsc --noEmit` (scoped to orchestration files)
- [ ] 15. Commit all artifacts with body ≤100 words
- [ ] 16. Report readiness + HOLD for merge-lane signal

---

## Future Increment Candidates (NOT CSV rows — rolling-wave only)

The following increments are candidates for future slices. They become CSV tasks
only when rolling-wave recon names them as the next justified step.

| Candidate | Gap | Dependency |
|-----------|-----|------------|
| ORCH-003 | Live lease store (GitHub Issues API) — enforces atomic CAS + exactly-one-active-lease | ADR-070 decision (this task) |
| ORCH-004 | Harness event ledger (append-only lifecycle log) | ORCH-003 live lease |
| ORCH-005 | Serialized merge-lane gate (3+1 policy enforced in code) | ORCH-003 + ORCH-004 |
| ORCH-006 | Failure classifier (structured exit-code taxonomy) | ORCH-004 event ledger |
| ORCH-007 | Automated task scheduler (rolling-wave dispatch loop) | ORCH-005 + ORCH-006 |
| ORCH-008 | Machine metrics from harness (OTLP → Railway) | ORCH-007 scheduler |

Rationale for sequencing: contract → lease → ledger → merge-lane → classifier →
scheduler → metrics. Each depends on its predecessor's outputs.

---

## Definition of Done (binary, no partial credit)

- [ ] All 7 acceptance criteria from spec.md pass
- [ ] `npx vitest run tools/scripts/orchestration/__tests__/` exits 0
- [ ] No TypeScript errors in new files
- [ ] Lint clean on new files
- [ ] ADR-070 contains ≥4 option evaluations + explicit recommendation
- [ ] agent-autonomy-policy.md has dispatch-binding section + enforcement matrix row
- [ ] ORCH-002 row in Sprint_plan.csv; splits regenerated; no other CSV changes
- [ ] Commit message body ≤100 words; no Co-Authored-By: Claude
