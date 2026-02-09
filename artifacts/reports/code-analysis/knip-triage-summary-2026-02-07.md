# Knip + Depcheck Triage Summary (Updated 2026-02-08)

**Primary Source**: `artifacts/reports/code-analysis/latest.json`  
**Knip Raw Report**: `artifacts/reports/code-analysis/knip-report-batch-c.json`

## Current Results

| Metric | Current |
|--------|---------|
| Unused files | **5** |
| Unused exports | **144** |
| Unused types | **169** |
| Knip unused dependencies | **24** |
| Depcheck unused dependencies | **0** |
| Depcheck unused devDependencies | **14** |
| Depcheck missing dependencies | **0** |

## Change Since Cached Baseline (07 Feb 2026, 18:42)

| Metric | Baseline | Current | Improvement |
|--------|----------|---------|-------------|
| Unused files | 68 | 5 | **-63** |
| Unused exports | 315 | 144 | **-171** |
| Unused types | 490 | 169 | **-321** |
| Unused dependencies (depcheck) | 14 | 14 | 0 |

## Remaining Unused Files (Actionable)

| File | Action |
|------|--------|
| `apps/api/src/shared/audit-encryption-module.ts` | Wire into active audit/security flow |
| `apps/api/src/shared/bias-detector.ts` | Wire into active scoring/guardrail flow |
| `apps/api/src/shared/retry-policy.ts` | Wire into retryable service calls |
| `apps/web/src/components/shared/entity-action-sheet.tsx` | Wire to active UI or quarantine |
| `apps/web/src/components/shared/more-actions-button.tsx` | Wire to active UI or quarantine |

## Notes

- `latest.json` was refreshed using the same command profile as project-tracker code-analysis route:
  - Knip: `npx knip --reporter json --exclude unlisted,unresolved --no-gitignore`
  - Depcheck: `npx depcheck --json --ignores="@types/*,eslint-*,prettier,husky,lint-staged,turbo"`
- Triage files were rewritten to remove stale counts and stale remediation notes.
