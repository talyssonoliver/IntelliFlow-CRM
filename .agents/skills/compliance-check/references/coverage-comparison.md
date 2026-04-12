# Compliance Check — Task-Specific Coverage with Before/After Comparison

**CRITICAL**: Compliance checks MUST show coverage BEFORE and AFTER to
demonstrate task impact.

## Package Mapping

| Task Pattern                                  | Package          |
| --------------------------------------------- | ---------------- |
| `IFC-085`, `IFC-005`, `IFC-155`, `AI-SETUP-*` | `apps/ai-worker` |
| `IFC-003`, `IFC-004`                          | `apps/api`       |
| `PG-*`, `IFC-090`, `IFC-091`                  | `apps/web`       |

## Coverage Comparison Output

When checking code quality, show before/after comparison:

```
### Coverage Impact (apps/ai-worker)
| Metric    | Before  | After   | Delta   | Status | Target | Met? |
|-----------|---------|---------|---------|--------|--------|------|
| Lines     | 48.00%  | 48.32%  | +0.32%  | ↑      | 80%    | NO   |
| Branches  | 38.52%  | 39.54%  | +1.02%  | ↑      | 80%    | NO   |
| Functions | 43.40%  | 44.28%  | +0.88%  | ↑      | 80%    | NO   |
| Files     | 34      | 35      | +1      | NEW    | -      | -    |

Coverage Impact: IMPROVED (+0.74% average)
```

## Coverage Impact Rules

| Delta                  | Compliance Status                        |
| ---------------------- | ---------------------------------------- |
| Positive (↑)           | PASS - Coverage improved                 |
| Zero (→)               | PASS - No regression                     |
| Small negative (↓ <2%) | WARN - Minor regression, document reason |
| Large negative (↓ ≥2%) | FAIL - Significant regression, must fix  |

## Why Before/After?

- Shows actual impact of implementation
- Detects coverage regressions immediately
- Provides evidence of test additions
- Enables quality gate enforcement
