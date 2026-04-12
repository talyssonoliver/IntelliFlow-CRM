# Fix Guidance Reference

Actionable fix patterns for common code review findings.

## Table of Contents

1. [TypeScript Errors](#typescript-errors)
2. [High Complexity](#high-complexity)
3. [Dead Code (Knip)](#dead-code-knip)
4. [Circular Dependencies](#circular-dependencies)
5. [Low Test Coverage](#low-test-coverage)
6. [Missing Tools](#missing-tools)
7. [Governance Issues](#governance-issues)

---

## TypeScript Errors

**Symptom**: `error TS2305: Module has no exported member`

**Common causes**:

- Missing export in source package
- Import of non-existent member
- Package not rebuilt after changes

**Fix patterns**:

### Option A: Add missing export

```typescript
// packages/adapters/src/index.ts
export { MissingService } from './services/missing.service';
```

### Option B: Remove unused import

```typescript
// If the import isn't actually needed, remove it
// import { UnusedService } from '@intelliflow/adapters';
```

### Verification

```bash
cd <affected-package>
pnpm typecheck
# Should show 0 errors
```

---

## High Complexity

**Symptom**: Files with cyclomatic complexity >20 in `complexity.json`

**Target**: Average complexity <15, no file >30

**Refactoring strategy**:

### Extract smaller functions

```typescript
// BEFORE: One function with complexity 73
export function analyzeStatistics(data: Data): Result {
  // 774 lines of nested logic
  if (condition1) {
    if (condition2) {
      /* deep nesting */
    }
  }
}

// AFTER: Multiple focused functions
export function analyzeStatistics(data: Data): Result {
  const cleaned = cleanData(data); // complexity: 5
  const validated = validateData(cleaned); // complexity: 4
  const transformed = transformData(validated); // complexity: 6
  const calculated = calculateMetrics(transformed); // complexity: 7
  return formatResults(calculated); // complexity: 3
}
```

### Reduce nesting with early returns

```typescript
// BEFORE
function process(input: Input): Output {
  if (input.valid) {
    if (input.complete) {
      // main logic
    }
  }
}

// AFTER
function process(input: Input): Output {
  if (!input.valid) return defaultOutput;
  if (!input.complete) return partialOutput;
  // main logic - no nesting
}
```

### Replace switch with strategy pattern

```typescript
// BEFORE: Large switch statement
switch (type) {
  case 'A':
    /* 50 lines */ break;
  case 'B':
    /* 50 lines */ break;
  // ...
}

// AFTER: Strategy map
const strategies: Record<Type, Strategy> = {
  A: new StrategyA(),
  B: new StrategyB(),
};
return strategies[type].execute(data);
```

---

## Dead Code (Knip)

**Symptom**: Unused exports, files, or dependencies in `deadcode.json`

**Categories**:

### Unused exports

```json
{
  "files": [],
  "dependencies": [],
  "exports": [{ "name": "unusedFunction", "file": "src/utils.ts" }]
}
```

**Fix**: Remove export or add `// knip-ignore` if intentionally unused (e.g.,
public API)

### Unused dependencies

```json
{
  "dependencies": ["lodash", "moment"]
}
```

**Fix**:

```bash
pnpm remove lodash moment
```

### Unused files

```json
{
  "files": ["src/legacy/old-module.ts"]
}
```

**Fix**: Delete file or move to archive if needed for reference

---

## Circular Dependencies

**Symptom**: Import cycles in `circular-deps.json`

**Example**:

```json
[
  {
    "package": "apps/api/src",
    "circular": [["moduleA.ts", "moduleB.ts", "moduleA.ts"]]
  }
]
```

**Fix patterns**:

### Extract shared types

```typescript
// BEFORE: A imports B, B imports A for types
// moduleA.ts
import { TypeFromB } from './moduleB';

// AFTER: Shared types in separate file
// types.ts (new)
export interface SharedType {
  /* ... */
}

// moduleA.ts
import { SharedType } from './types';
```

### Dependency inversion

```typescript
// BEFORE: Direct dependency
// serviceA.ts
import { ServiceB } from './serviceB';

// AFTER: Depend on interface
// ports/service-b.port.ts
export interface ServiceBPort { /* ... */ }

// serviceA.ts
import { ServiceBPort } from './ports/service-b.port';
constructor(private serviceB: ServiceBPort) {}
```

### Install and run madge

```bash
pnpm add -g madge
madge --circular apps/api/src
```

---

## Low Test Coverage

**Symptom**: Coverage <70% in `coverage-summary.json`

**Targets**:

- Domain layer: >95%
- Application layer: >90%
- Critical packages (api, domain, application): >80%
- All packages: >60%

**Identify gaps**:

```powershell
$coverage = Get-Content ".specify/sprints/sprint-0/reports/code-review/latest/coverage-summary.json" | ConvertFrom-Json
$coverage.PSObject.Properties |
  Where-Object { $_.Value.lines.pct -lt 60 } |
  Select-Object Name, @{N='Coverage';E={$_.Value.lines.pct}} |
  Sort-Object Coverage
```

**Fix approach**:

1. Identify uncovered files: `artifacts/coverage/index.html`
2. Prioritize critical paths (auth, payments, data access)
3. Add unit tests for edge cases
4. Add integration tests for API routes

---

## Missing Tools

### madge (circular dependency detection)

```bash
pnpm add -g madge
# or locally
pnpm add -D madge
```

### depcheck (unused dependencies)

```bash
pnpm add -D depcheck
```

### knip (dead code)

Already in devDependencies. If failing:

```bash
# Correct syntax (was fixed in script)
pnpm knip --exclude=unlisted --exclude=unresolved --reporter json
```

---

## Governance Issues

**Symptom**: Plan linter errors for Tier A tasks

**Example errors**:

```
[TIER_A_GATES_REQUIRED] Tier A task IFC-093 missing gate_profile
[TIER_A_OWNER_REQUIRED] Tier A task IFC-093 missing acceptance_owner
[TIER_A_EVIDENCE_REQUIRED] Tier A task IFC-093 missing evidence_required
```

**Fix**: Update Sprint_plan.csv with required governance fields:

| Field               | Required For | Example                               |
| ------------------- | ------------ | ------------------------------------- |
| `gate_profile`      | Tier A tasks | `standard`, `security`, `performance` |
| `acceptance_owner`  | Tier A tasks | `Tech Lead`, `QA Lead`                |
| `evidence_required` | Tier A tasks | `test-coverage`, `security-scan`      |

**Location**: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
