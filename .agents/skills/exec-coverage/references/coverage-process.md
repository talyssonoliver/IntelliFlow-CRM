# Coverage Process — Detailed Steps & Commands

## BEFORE Implementation

```bash
# 1. Identify package from task ID
PACKAGE="apps/ai-worker"  # or apps/api, apps/web

# 2. Run tests with coverage
pnpm --filter @intelliflow/ai-worker test -- --coverage

# 3. Parse artifacts/coverage/coverage-summary.json
# Filter to files in $PACKAGE
# Store as baseline metrics
```

**Display:**
```
[Coverage BEFORE] Package: apps/ai-worker (34 files)
| Metric    | Covered | Total | %      | Target (80%) |
|-----------|---------|-------|--------|--------------|
| Lines     | 1200    | 2500  | 48.00% | NOT MET      |
| Branches  | 520     | 1350  | 38.52% | NOT MET      |
| Functions | 230     | 530   | 43.40% | NOT MET      |
Baseline captured at: 2026-01-23T20:15:00.000Z
```

---

## AFTER Implementation

```bash
# 1. Run tests with coverage again
pnpm --filter @intelliflow/ai-worker test -- --coverage

# 2. Parse artifacts/coverage/coverage-summary.json
# Compare with baseline, calculate delta
```

**Display:**
```
[Coverage AFTER] Package: apps/ai-worker (35 files)
| Metric    | Before  | After   | Delta   | Status |
|-----------|---------|---------|---------|--------|
| Lines     | 48.00%  | 48.32%  | +0.32%  | GOOD   |
| Branches  | 38.52%  | 39.54%  | +1.02%  | GOOD   |
| Functions | 43.40%  | 44.28%  | +0.88%  | GOOD   |
| Files     | 34      | 35      | +1      | NEW    |
Coverage Impact: IMPROVED (+0.74% average)
```

---

## Coverage Impact Rules

| Delta | Status | Action |
|---|---|---|
| Positive | GOOD | Coverage improved, proceed |
| Zero | OK | No regression, proceed |
| Negative | WARN | Coverage decreased, document reason |
| Large negative (>5%) | BLOCK | Significant regression, fix before completing |

---

## Parsing coverage-summary.json

The file is at `artifacts/coverage/coverage-summary.json` and has this structure:

```json
{
  "total": {
    "lines": { "total": 2500, "covered": 1200, "skipped": 0, "pct": 48.0 },
    "statements": { "total": 2600, "covered": 1250, "skipped": 0, "pct": 48.08 },
    "functions": { "total": 530, "covered": 230, "skipped": 0, "pct": 43.4 },
    "branches": { "total": 1350, "covered": 520, "skipped": 0, "pct": 38.52 }
  },
  "apps/ai-worker/src/chains/scoring.chain.ts": {
    "lines": { "total": 45, "covered": 45, "skipped": 0, "pct": 100 },
    ...
  }
}
```

Filter to your package's files by matching the file path prefix.

---

## Package Run Commands

```bash
# apps/web
pnpm --filter @intelliflow/web test -- --coverage

# apps/api
pnpm --filter @intelliflow/api test -- --coverage

# apps/ai-worker
pnpm --filter @intelliflow/ai-worker test -- --coverage
```

---

## API Support

The validation summary API at `/api/tasks/validation-summary/[taskId]` returns package-specific coverage automatically:

```bash
curl http://localhost:3002/api/tasks/validation-summary/<TASK_ID>
```

The API:
1. Maps the task ID to a package using `TASK_PACKAGE_MAP`
2. Reads `artifacts/coverage/coverage-summary.json`
3. Filters to files in that package
4. Returns coverage percentages for the task's package

To update mappings, edit `TASK_PACKAGE_MAP` in:
`apps/project-tracker/app/api/tasks/validation-summary/[taskId]/route.ts`

---

## Important: Attestation Note

`coverage_metrics` is NOT a valid field in `attestation.json` (additionalProperties: false in schema).

Coverage data is loaded separately by the validation-summary API from `artifacts/coverage/coverage-summary.json`.

**What to do instead**: Include coverage highlights in the attestation `notes` field:
```json
{
  "notes": "Login page implemented. Package coverage: lines 48.32% (+0.32% from baseline), functions 44.28%."
}
```

The actual percentage numbers for KPIs must come from Gate 7 (scoped coverage run), not from the package-wide before/after tracking.
