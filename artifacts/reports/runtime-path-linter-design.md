# Runtime Path Linter - Design Document

**Agent**: SUB-AGENT D (Governance/Lint Agent)
**Date**: 2025-12-21
**Version**: 1.0.0
**Status**: Design Complete - Ready for Implementation

---

## Executive Summary

This document presents the complete design for a **Runtime Artifact Path Linter** that prevents hygiene regressions in the IntelliFlow-CRM repository by enforcing strict policies on file locations.

### Key Features

✅ **Forbidden Runtime Detection** - Detects files in forbidden paths (including git-ignored)
✅ **Canonical Uniqueness Enforcement** - Ensures exactly ONE copy of critical files
✅ **Policy-Pending with Deadlines** - Gradual migration enforcement
✅ **Local vs CI Modes** - WARN locally, FAIL in CI
✅ **Drift Detection** - Scans ignored files for violations
✅ **GitHub Actions Integration** - Automated PR checks with comments

---

## 1. Policy Configuration Design

### File: `tools/audit/policies/runtime-path-policy.yml`

**Schema Version**: 1.0.0

#### 1.1 Canonical Files Section

Enforces single-source-of-truth for critical files:

```yaml
canonical:
  - path: 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
    description: 'Single source of truth for all sprint tasks'
    referenced_by:
      - 'apps/project-tracker/app/api/sprint-plan/route.ts'
      - 'tools/plan-linter/index.js'
```

**Detection Logic**:
- ✅ File exists at canonical path
- ❌ File missing (strict mode) → ERROR
- ❌ Multiple copies → DUPLICATE VIOLATION

#### 1.2 Forbidden Paths Section

Patterns that must NEVER exist:

```yaml
forbidden:
  - pattern: '/*.json'
    exceptions: ['package.json', 'tsconfig.json']
    severity: 'error'
    message: 'Root-level JSON files are forbidden'
    fix: 'Move to artifacts/misc/ or delete if runtime-generated'
```

**Pattern Categories**:
1. Root-level artifacts (`/*.log`, `/*.csv`, `/*.json`)
2. Runtime artifacts in docs (`docs/metrics/.locks/**/*`)
3. Logs in source code (`src/**/*.log`)
4. Prohibited extensions (`**/*.secret.*`, `**/*.private.*`)

#### 1.3 Policy Pending Section

Transitional enforcement with deadlines:

```yaml
policy_pending:
  - pattern: 'apps/project-tracker/docs/artifacts/**/*'
    deadline: '2025-01-15'
    severity_local: 'warning'  # Local: WARN
    severity_ci: 'error'        # CI: FAIL
    reason: 'Migration from docs/artifacts to artifacts/ in progress'
    migration_target: 'artifacts/'
```

**Enforcement Timeline**:
- **Before deadline**:
  - Local: WARNING
  - CI: ERROR
- **After deadline**:
  - Local: ERROR
  - CI: ERROR

#### 1.4 Allowed Patterns Section

Explicitly permitted locations:

```yaml
allowed:
  - pattern: 'artifacts/logs/**/*'
    description: 'Application and build logs'

  - pattern: 'apps/project-tracker/docs/metrics/sprint-*/**/*.json'
    exclude_patterns:
      - '**/*.lock'
      - '**/*.bak'
```

#### 1.5 Duplicate Rules Section

Files that must be unique:

```yaml
duplicate_rules:
  - filename: 'Sprint_plan.csv'
    max_copies: 1
    canonical_path: 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
    severity: 'error'
```

**Files Enforced**:
- `Sprint_plan.csv` (1 copy max)
- `Sprint_plan.json` (1 copy max)
- `task-registry.json` (1 copy max)
- `dependency-graph.json` (1 copy max)

#### 1.6 Strict Mode Configuration

```yaml
strict_mode:
  enabled_by:
    - 'CI'
    - 'STRICT_VALIDATION'
    - 'PRE_COMMIT_HOOK'
  policy_pending_as_failure: true
  warnings_as_failure: false
  max_warnings: 10
  require_canonical_files: true
  fail_on_duplicates: true
  scan_gitignore: true  # Drift detection
```

---

## 2. Linter Implementation Design

### File: `tools/audit/runtime-path-linter.ts`

**Language**: TypeScript (Node.js 20+)
**Architecture**: Pure functions + Class-based orchestration

#### 2.1 Core Architecture

```typescript
┌─────────────────────────────────────────┐
│     RuntimePathLinter (Orchestrator)    │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   File Collection Layer         │   │
│  │  • getTrackedFiles()            │   │
│  │  • getIgnoredFiles()            │   │
│  │  • getUntrackedFiles()          │   │
│  │  • getChangedFiles() (PR mode)  │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   Validation Layer              │   │
│  │  • checkCanonicalFiles()        │   │
│  │  • checkDuplicates()            │   │
│  │  • checkForbiddenPaths()        │   │
│  │  • checkPolicyPending()         │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   Reporting Layer               │   │
│  │  • printResults()               │   │
│  │  • writeJsonReport()            │   │
│  │  • writeMarkdownSummary()       │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

#### 2.2 Key Functions (Pure)

```typescript
/**
 * Convert glob pattern to regex
 */
function globToRegex(pattern: string): RegExp;

/**
 * Check if file matches glob pattern
 */
function matchesPattern(file: string, pattern: string): boolean;

/**
 * Calculate days until deadline
 */
function daysUntilDeadline(deadline: string): number;

/**
 * Check if strict mode is enabled
 */
function isStrictMode(policy: PolicyConfig, args: string[]): boolean;
```

#### 2.3 Detection Methods

##### Git Integration

```typescript
// Tracked files
function getTrackedFiles(): string[] {
  execSync('git ls-files');
}

// Ignored files (drift detection)
function getIgnoredFiles(): string[] {
  execSync('git ls-files -o -i --exclude-standard');
}

// Untracked files
function getUntrackedFiles(): string[] {
  execSync('git ls-files -o --exclude-standard');
}

// Changed files (PR mode)
function getChangedFiles(base: string): string[] {
  execSync(`git diff --name-only ${base}...HEAD`);
}
```

##### Pattern Matching

```typescript
// Example: '/*.json' -> /^\/[^/]*\.json$/
const regex = globToRegex('/*.json');

// Check file
if (matchesPattern('Sprint_plan.csv', '/*.csv')) {
  // Violation!
}

// Check exceptions
const isException = exceptions.some(ex => matchesPattern(file, ex));
if (!isException) {
  violations.push({ ... });
}
```

#### 2.4 Validation Logic

##### Forbidden Path Check

```typescript
private checkForbiddenPaths(files: string[]): void {
  for (const file of files) {
    for (const forbidden of this.policy.forbidden) {
      if (matchesPattern(file, forbidden.pattern)) {
        const isException = forbidden.exceptions.some(ex =>
          matchesPattern(file, ex)
        );
        if (!isException) {
          this.violations.push({
            file,
            rule: 'forbidden-path',
            severity: forbidden.severity,
            message: forbidden.message,
            fix: forbidden.fix,
          });
        }
      }
    }
  }
}
```

##### Duplicate Detection

```typescript
private checkDuplicates(files: string[]): void {
  for (const rule of this.policy.duplicate_rules) {
    const matches = files.filter(f =>
      path.basename(f) === rule.filename
    );

    if (matches.length > rule.max_copies) {
      for (const file of matches) {
        if (file !== rule.canonical_path) {
          this.violations.push({
            file,
            rule: 'duplicate-violation',
            severity: rule.severity,
            message: rule.message,
          });
        }
      }
    }
  }
}
```

##### Policy Pending Check

```typescript
private checkPolicyPending(files: string[]): void {
  for (const file of files) {
    for (const pending of this.policy.policy_pending) {
      if (matchesPattern(file, pending.pattern)) {
        const daysLeft = daysUntilDeadline(pending.deadline);
        const isExpired = daysLeft <= 0;

        // Severity escalation
        let severity = this.strict
          ? pending.severity_ci
          : pending.severity_local;

        if (isExpired && this.strict) {
          severity = 'error';
        }

        this.violations.push({
          file,
          rule: 'policy-pending',
          severity,
          message: `${pending.message} (Deadline: ${pending.deadline})`,
          deadline: pending.deadline,
        });
      }
    }
  }
}
```

#### 2.5 Output Formats

##### Console (Color-coded)

```
🔍 Runtime Artifact Path Linter
Policy: tools/audit/policies/runtime-path-policy.yml
Mode: STRICT (CI)

Scanning 1523 files...

ERRORS (3)
  ✗ Sprint_plan_backup.csv
    [forbidden-path] Root-level CSV files are forbidden
    Fix: Move to artifacts/metrics/

Statistics:
  Files scanned: 1523
  Errors: 3
  Warnings: 0

✗ Linting failed with 3 error(s)
```

##### JSON Report

```json
{
  "meta": {
    "generated_at": "2025-12-21T12:34:56.789Z",
    "mode": "strict"
  },
  "result": {
    "passed": false,
    "violations": [...],
    "stats": {
      "total_files_scanned": 1523,
      "errors": 3
    }
  }
}
```

##### Markdown Summary

For GitHub PR comments and documentation.

---

## 3. GitHub Actions Integration

### File: `.github/workflows/runtime-path-lint.yml`

#### 3.1 Workflow Structure

```yaml
jobs:
  lint-runtime-paths:      # Main linter job (strict mode)
  check-canonical-files:   # Verify canonical files exist
  drift-detection:         # Scan ignored files (main/develop only)
  validate-gitignore:      # Ensure runtime patterns ignored
  summary:                 # Aggregate results
```

#### 3.2 Trigger Conditions

**Pull Requests**:
```yaml
on:
  pull_request:
    branches: [main, develop]
    paths:
      - 'apps/project-tracker/docs/metrics/**/*'
      - 'artifacts/**/*'
      - 'tools/audit/runtime-path-linter.ts'
```

**Push Events**:
```yaml
on:
  push:
    branches: [main, develop]
```

**Manual Dispatch**:
```yaml
on:
  workflow_dispatch:
    inputs:
      strict_mode:
        type: boolean
        default: true
```

#### 3.3 Job: lint-runtime-paths

```yaml
- name: Run runtime path linter (strict mode)
  env:
    CI: 'true'
    STRICT_VALIDATION: 'true'
  run: |
    pnpm tsx tools/audit/runtime-path-linter.ts --strict --format=all
```

**Artifacts Uploaded**:
- `lint-output.txt` (console output)
- `runtime-path-lint-report.json` (structured data)
- `runtime-path-lint-summary.md` (markdown report)

**Retention**: 30 days

#### 3.4 Job: check-canonical-files

Fast verification of critical files:

```yaml
- name: Check Sprint_plan.csv exists
  run: |
    if [ ! -f "apps/project-tracker/docs/metrics/_global/Sprint_plan.csv" ]; then
      echo "::error::Canonical Sprint_plan.csv is missing!"
      exit 1
    fi
```

**Files Checked**:
- `Sprint_plan.csv`
- `task-registry.json`

**Duplicate Detection**:
```bash
find . -name "Sprint_plan.csv" | wc -l
# Must equal 1
```

#### 3.5 Job: drift-detection

**Runs**: Only on push to `main`/`develop` (not PRs)

```yaml
- name: Scan ignored files for forbidden patterns
  run: |
    pnpm tsx tools/audit/runtime-path-linter.ts --strict
    # Scans git-ignored files via: git ls-files -o -i --exclude-standard
```

**Purpose**: Detect violations in `.gitignore` files that should never exist.

#### 3.6 Job: validate-gitignore

```yaml
- name: Check runtime artifacts are ignored
  run: |
    if ! grep -q "artifacts/reports/system-audit/local-" .gitignore; then
      echo "::warning::Missing .gitignore pattern"
    fi
```

**Patterns Validated**:
- `artifacts/reports/system-audit/local-*`
- `**/*.heartbeat`
- `**/*.input`

#### 3.7 PR Comment Integration

```yaml
- name: Comment PR with results
  uses: actions/github-script@v7
  with:
    script: |
      const summary = fs.readFileSync('runtime-path-lint-summary.md');
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        body: `## 🚨 Runtime Path Linting Failed\n\n${summary}`
      });
```

**Comment Includes**:
- Violations grouped by severity
- Fix suggestions
- Links to documentation
- Example fixes

---

## 4. Severity Model

### 4.1 Local Mode

```
Forbidden Paths     → ERROR (fail)
Duplicates          → ERROR (fail)
Policy Pending      → WARNING (don't fail)
Canonical Missing   → WARNING (don't fail)
```

### 4.2 CI/Strict Mode

```
Forbidden Paths          → ERROR (fail)
Duplicates               → ERROR (fail)
Policy Pending (active)  → ERROR (fail)
Policy Pending (expired) → ERROR (fail)
Canonical Missing        → ERROR (fail)
Warnings > 10            → ERROR (fail)
```

### 4.3 Severity Escalation

```typescript
// Policy pending before deadline
severity = strict ? pending.severity_ci : pending.severity_local;

// Policy pending after deadline
if (daysUntilDeadline <= 0 && strict) {
  severity = 'error';
}
```

---

## 5. Common Violations & Remediation

### 5.1 Root-Level Artifacts

**Violation**:
```
✗ Sprint_plan_backup.csv
  [forbidden-path] Root-level CSV files are forbidden
```

**Automated Fix**:
```bash
# Move to artifacts
mkdir -p artifacts/metrics
mv Sprint_plan_backup.csv artifacts/metrics/
```

**Manual Fix**:
```bash
# Add to .gitignore if runtime-generated
echo "Sprint_plan_backup.csv" >> .gitignore
git rm --cached Sprint_plan_backup.csv
```

### 5.2 Runtime Artifacts in docs/

**Violation**:
```
✗ apps/project-tracker/docs/metrics/.locks/task-123.lock
  [forbidden-path] Lock files in docs/metrics are forbidden
```

**Fix**:
```bash
# Delete runtime artifacts
rm -rf apps/project-tracker/docs/metrics/.locks

# Add to .gitignore
echo "apps/project-tracker/docs/metrics/.locks/" >> .gitignore
```

### 5.3 Duplicate Canonical Files

**Violation**:
```
✗ Sprint_plan.csv
  [duplicate-violation] Multiple copies detected
```

**Fix**:
```bash
# Delete all except canonical
find . -name "Sprint_plan.csv" \
  -not -path "apps/project-tracker/docs/metrics/_global/*" \
  -delete
```

### 5.4 Policy Pending (Migration)

**Violation**:
```
⚠ apps/project-tracker/docs/artifacts/test.json
  [policy-pending] Deprecated location (Deadline: 2025-01-15)
```

**Fix**:
```bash
# Run migration script (if available)
pnpm tsx tools/audit/migrate-artifacts.ts

# Or manual move
mkdir -p artifacts/misc
mv apps/project-tracker/docs/artifacts/test.json artifacts/misc/
```

---

## 6. Exit Codes

| Code | Meaning | Example |
|------|---------|---------|
| 0 | Success | No violations |
| 1 | Forbidden/Duplicate | Files in forbidden paths |
| 2 | Canonical Missing | Sprint_plan.csv not found |
| 3 | Policy Expired | Deadline passed |
| 4 | Parse Error | Invalid YAML config |

---

## 7. Testing Strategy

### 7.1 Unit Tests

```typescript
describe('RuntimePathLinter', () => {
  describe('globToRegex', () => {
    it('converts ** to .*', () => {
      expect(globToRegex('**/*.json')).toMatch('dir/file.json');
    });
  });

  describe('matchesPattern', () => {
    it('matches forbidden patterns', () => {
      expect(matchesPattern('debug.log', '*.log')).toBe(true);
    });
  });

  describe('checkForbiddenPaths', () => {
    it('detects root-level artifacts', () => {
      const violations = linter.checkForbiddenPaths(['test.log']);
      expect(violations).toHaveLength(1);
    });
  });
});
```

### 7.2 Integration Tests

```typescript
describe('Integration', () => {
  it('detects duplicates in real repository', async () => {
    const result = await linter.run(['--strict']);
    expect(result.stats.duplicate_violations).toBe(0);
  });

  it('enforces canonical file existence', async () => {
    const result = await linter.run(['--strict']);
    expect(result.stats.canonical_files_status['Sprint_plan.csv']).toBe(true);
  });
});
```

### 7.3 E2E Tests (GitHub Actions)

```yaml
# .github/workflows/test-runtime-path-linter.yml
- name: Test linter with known violations
  run: |
    # Create violation
    echo "test" > forbidden.log

    # Run linter (should fail)
    pnpm tsx tools/audit/runtime-path-linter.ts --strict && exit 1 || exit 0

    # Clean up
    rm forbidden.log
```

---

## 8. Audit Matrix Integration

### File: `audit-matrix.yml`

Add runtime path linter as Tier 1 blocker:

```yaml
tools:
  - id: runtime-path-lint
    tier: 1
    enabled: true
    required: true
    owner: 'Tech Lead'
    scope: 'repo'
    command: 'pnpm tsx tools/audit/runtime-path-linter.ts --strict'
    thresholds:
      max_violations: 0
    expected_outputs: ['log', 'json']
```

**Integration Points**:
- Sprint 0 attestation system
- STOA governance framework
- Pre-commit hooks
- CI/CD pipelines

---

## 9. Future Enhancements

### 9.1 Auto-Remediation

```typescript
class RuntimePathLinter {
  async autoFix(): Promise<void> {
    for (const violation of this.violations) {
      if (violation.rule === 'forbidden-path') {
        await this.moveToArtifacts(violation.file);
      }
    }
  }
}
```

### 9.2 Historical Analysis

```typescript
interface TrendData {
  date: string;
  forbidden_violations: number;
  duplicate_violations: number;
}

// Track violations over time
function analyzeTrends(history: TrendData[]): void {
  // Generate trend charts
  // Identify regression patterns
}
```

### 9.3 Custom Rules Engine

```yaml
custom_rules:
  - id: 'secret-detection'
    pattern: '**/*'
    validator: 'tools/audit/validators/secret-scanner.ts'
    severity: 'error'
```

---

## 10. Deliverables

### ✅ Completed

1. **Policy Configuration**
   - File: `tools/audit/policies/runtime-path-policy.yml`
   - Defines: Forbidden, canonical, allowed, policy-pending, strict mode

2. **Linter Implementation**
   - File: `tools/audit/runtime-path-linter.ts`
   - Features: Drift detection, duplicate checking, severity model

3. **GitHub Actions Workflow**
   - File: `.github/workflows/runtime-path-lint.yml`
   - Jobs: Linting, canonical checks, drift detection, gitignore validation

4. **Documentation**
   - File: `tools/audit/policies/README.md`
   - Covers: Usage, examples, FAQ, integration

5. **Design Document**
   - File: `artifacts/reports/runtime-path-linter-design.md`
   - This document

---

## 11. Implementation Checklist

### Phase 1: Setup (Week 1)
- [x] Create policy YAML schema
- [x] Implement TypeScript linter
- [x] Write GitHub Actions workflow
- [x] Document usage and examples
- [ ] Add to package.json scripts
- [ ] Configure pre-commit hook

### Phase 2: Testing (Week 2)
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Test in CI environment
- [ ] Fix edge cases
- [ ] Performance optimization

### Phase 3: Integration (Week 3)
- [ ] Add to audit-matrix.yml
- [ ] Integrate with STOA framework
- [ ] Update contributor guidelines
- [ ] Team training session
- [ ] Monitor first week violations

### Phase 4: Refinement (Week 4)
- [ ] Analyze false positives
- [ ] Tune policy rules
- [ ] Add auto-remediation
- [ ] Historical trend analysis
- [ ] Documentation improvements

---

## 12. Success Metrics

### 12.1 Enforcement Metrics

- **Violations Detected**: Count per week
- **False Positive Rate**: < 5%
- **CI Failure Rate**: Due to linter < 2%
- **Remediation Time**: < 5 minutes per violation

### 12.2 Quality Metrics

- **Canonical File Duplicates**: 0 (target)
- **Forbidden Path Violations**: 0 (target)
- **Policy Pending Items**: Decreasing trend
- **Gitignore Coverage**: 100% runtime artifacts

### 12.3 Team Metrics

- **Developer Friction**: Low (measured via survey)
- **Documentation Clarity**: > 4/5 rating
- **Fix Confidence**: > 90% fix on first attempt
- **Training Time**: < 30 minutes to onboard

---

## 13. Risk Mitigation

### 13.1 Risk: False Positives

**Mitigation**:
- Extensive exception lists in policy
- Local mode shows warnings (non-blocking)
- Clear fix suggestions in output
- Easy to add exceptions via YAML

### 13.2 Risk: Performance Impact

**Mitigation**:
- PR mode: Only scan changed files
- Caching of git commands
- Timeout limit: 10 minutes
- Parallel job execution

### 13.3 Risk: Developer Resistance

**Mitigation**:
- Clear documentation
- Helpful error messages
- Auto-fix capabilities
- Gradual rollout via policy-pending

### 13.4 Risk: Policy Drift

**Mitigation**:
- Policy file in version control
- Change log required for modifications
- Review process for policy changes
- Periodic policy audits

---

## 14. Conclusion

The **Runtime Path Linter** provides comprehensive protection against artifact hygiene regressions through:

1. **Multi-layered Detection**: Tracked, ignored, and untracked files
2. **Flexible Enforcement**: Local warnings, CI failures, policy-pending
3. **Clear Remediation**: Actionable fix suggestions
4. **Automated Integration**: GitHub Actions, pre-commit hooks
5. **Extensible Design**: Easy to add custom rules

**Status**: Design complete and ready for implementation.

**Next Steps**:
1. Review design with Tech Lead
2. Add to Sprint 0 task tracking
3. Begin Phase 1 implementation
4. Schedule team demo

---

**Document Metadata**:
- **Author**: SUB-AGENT D (Governance/Lint Agent)
- **Reviewed By**: [Pending]
- **Approved By**: [Pending]
- **Implementation Start**: [TBD]
- **Target Completion**: [TBD]
