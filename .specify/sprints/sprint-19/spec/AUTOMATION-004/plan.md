# AUTOMATION-004 Execution Plan

**Task ID**: AUTOMATION-004-task-contract-schema-and-dispatch-guard
**Sprint**: 19
**Baseline SHA**: `1810a937137adf4b8410eac1719500ea3558ac3b`

---

## Execution Steps (this task)

- [x] 1. Worktree created: `../iflow-orch-002-contract-and-guard/` off `1810a937`
- [x] 2. Dedup verified: grep for AUTOMATION/ORCH harness rows across all Sprint_plan_*.csv
- [x] 3. ADR number confirmed: ADR-069 is "rolling-wave-rebaselining" → next is **ADR-070**
- [x] 4. Spec written (this file's sibling: spec.md)
- [x] 5. Plan written (this file)
- [x] 6. ADR-070 authored — evaluates ≥4 ledger options; corrected Option B verdict
- [x] 7. `tools/scripts/orchestration/schemas/task-contract.schema.json` — 20-field JSON Schema
- [x] 8. `tools/scripts/orchestration/validate-task-contract.ts` — validator module + CLI
- [x] 9. `tools/scripts/orchestration/__tests__/validate-task-contract.test.ts` — test suite
- [x] 10. `tools/scripts/orchestration/verify-dispatch-binding.ts` — dispatch-binding guard CLI
- [x] 11. `docs/operations/agent-autonomy-policy.md` — dispatch-binding section appended
- [x] 12. `Sprint_plan.csv` — AUTOMATION-004 row appended (renamed from ORCH-002); splits regenerated
- [x] 13. Scoped unit tests: `npx vitest run tools/scripts/orchestration/__tests__/`
- [x] 14. TypeScript check passes (turbo typecheck + sonar guard)
- [x] 15. Owner 5-point review completed:
       (a) Task ID renamed ORCH-002 → AUTOMATION-004
       (b) ADR-070 Option B verdict corrected (GitHub Issues fails R1/R2/R6)
       (c) Guard enhanced with stored-lease authority check
       (d) Restart-persistence test added; ADR limitation note added
       (e) additionalProperties:false enforced in runtime validator + rejection test
- [x] 16. Commit all artifacts; HOLD for merge-lane signal (Slot 2)

---

## Future Increment Candidates (NOT CSV rows — rolling-wave only)

The following increments are candidates for future slices. They become CSV tasks
only when rolling-wave recon names them as the next justified step.

| Candidate | Gap | Dependency |
|-----------|-----|------------|
| AUTOMATION-005 | Live lease store — atomic CAS + exactly-one-active-lease across environments; Upstash Redis SET NX EX is the leading candidate (satisfies all 9 requirements per ADR-070 §Decision 3) | ADR-070 decision (this task) |
| AUTOMATION-006 | Harness event ledger (append-only lifecycle log) | AUTOMATION-005 live lease |
| AUTOMATION-007 | Serialized merge-lane gate (3+1 policy enforced in code) | AUTOMATION-005 + AUTOMATION-006 |
| AUTOMATION-008 | Failure classifier (structured exit-code taxonomy) | AUTOMATION-006 event ledger |
| AUTOMATION-009 | Automated task scheduler (rolling-wave dispatch loop) | AUTOMATION-007 + AUTOMATION-008 |
| AUTOMATION-010 | Machine metrics from harness (OTLP → Railway) | AUTOMATION-009 scheduler |

Rationale for sequencing: contract → lease → ledger → merge-lane → classifier →
scheduler → metrics. Each depends on its predecessor's outputs.

---

## Definition of Done (binary, no partial credit)

- [x] All 7 acceptance criteria from spec.md pass
- [x] `npx vitest run tools/scripts/orchestration/__tests__/` exits 0
- [x] No TypeScript errors in new files
- [x] Lint clean on new files (sonar cognitive-complexity ≤15)
- [x] ADR-070 contains ≥4 option evaluations with corrected verdicts; no evaluated option passes all 9 cross-env requirements; AUTOMATION-005 leading candidate identified
- [x] agent-autonomy-policy.md has dispatch-binding section + enforcement matrix row
- [x] AUTOMATION-004 row in Sprint_plan.csv; splits regenerated; no other CSV changes
- [x] Commit message body ≤100 words; no Co-Authored-By: Claude
- [x] Coverage ≥90% reconfirmed after all owner-correction changes
