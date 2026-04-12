# START_FIX_INCOMPLETE_TASKS

**Purpose**  
Track remediation steps for tasks flagged as incomplete or missing artifacts in sprint/quality reports (covers EXP-REPORTS-002 continuous tracking).

**Last updated**: 2026-02-06  
**Owner**: Tech Lead (STOA-Quality)

## Current gaps
- Missing/incorrect artifact references occasionally appear in Sprint_plan and task-registry (recent fixes: vitest config path, user-test-results, forecast-algorithm, decision-gate-1, retrieval tool, conversation migration).
- Periodic plan-lint warnings not yet re-run after path fixes.

## Action items
1) Re-run plan linter and regenerate reports  
   - `node tools/plan-linter/index.js --fix`
2) Validate evidence bundles for in-scope tasks (EXP-REPORTS-002)  
   - Ensure `.specify/sprints/**/attestations/*/context_ack.json` present.
3) Refresh quality reports  
   - `pnpm test`, `pnpm lint`, update `artifacts/reports/review-queue.json` if new warnings arise.
4) Log any new incomplete tasks and map to owners within `docs/debt-ledger.yaml`.

## Next review
- Weekly on Mondays; next check: 2026-02-09.

## Related artifacts
- `docs/debt-ledger.yaml`
- `artifacts/reports/review-queue.json`
- `artifacts/reports/stoa-review-queue.json`
- `artifacts/reports/task-validation-summary-2025-12-25T18-15-00.json`
