# Manual Fallback Procedures

This document defines procedures for triggering manual fallback when
AI-generated outputs fail review or cause issues in the IntelliFlow CRM project.
It ensures zero regressions from AI outputs.

## Overview

This document covers:

- **When to Trigger Fallback**: Conditions requiring manual intervention
- **Step-by-Step Fallback Process**: Detailed procedure
- **Rollback Procedures**: Reverting problematic changes
- **Escalation Paths**: When and how to escalate
- **Recovery Verification**: Confirming system stability
- **Zero-Regression Validation**: Ensuring no quality degradation

---

## 1. When to Trigger Manual Fallback

### 1.1 Immediate Fallback Triggers

Trigger manual fallback **immediately** when:

| Condition                             | Severity | Action Required                        |
| ------------------------------------- | -------- | -------------------------------------- |
| Production incident caused by AI code | Critical | Immediate rollback                     |
| Security vulnerability discovered     | Critical | Immediate rollback                     |
| Data corruption or loss               | Critical | Immediate rollback + incident response |
| CI/CD pipeline blocked                | High     | Revert and investigate                 |
| Architecture boundary violations      | High     | Revert before merge                    |
| Test suite failure > 5%               | High     | Revert and fix                         |
| Performance degradation > 20%         | High     | Investigate and possibly revert        |

### 1.2 Conditional Fallback Triggers

Consider fallback when:

- AI output requires > 50% modification to pass review
- Same type of issue recurs 3+ times with AI output
- Review confidence is low (unclear if code is correct)
- AI tool produces inconsistent results repeatedly
- Team consensus is that manual implementation is faster

### 1.3 Proactive Fallback Indicators

Signs that manual implementation may be preferable:

- Complex domain logic with intricate business rules
- Security-critical code (auth, encryption, access control)
- Performance-critical paths (hot loops, real-time processing)
- Integration with undocumented external systems
- Novel algorithms not in AI training data

---

## 2. Step-by-Step Fallback Process

### 2.1 Phase 1: Assessment (5-15 minutes)

```
1. IDENTIFY the failing AI output
   - Which AI tool generated it?
   - What was the original prompt/task?
   - What specifically failed review?

2. CLASSIFY the failure
   - [ ] Security issue
   - [ ] Architecture violation
   - [ ] Test failure
   - [ ] Performance issue
   - [ ] Quality/correctness issue
   - [ ] Documentation issue

3. EVALUATE impact
   - Is this blocking other work?
   - Has this been merged to main?
   - Is this in production?
   - Are other components affected?

4. DECIDE on approach
   - Quick fix possible? (< 30 min)
   - Revert required?
   - Full manual rewrite needed?
```

### 2.2 Phase 2: Containment (Immediate)

```powershell
# If changes are in a feature branch (not merged):
git checkout feature/ai-generated-code
git status  # Review current state

# If changes have been merged to main:
git log --oneline -10  # Find the problematic commit
git revert <commit-sha> -m 1  # Revert merge commit
git push origin main

# If changes are in production:
# STOP - Follow incident response procedure first
# See Section 4: Escalation Paths
```

### 2.3 Phase 3: Manual Implementation

1. **Create new branch** from clean state:

   ```bash
   git checkout main
   git pull origin main
   git checkout -b fix/manual-impl-<task-id>
   ```

2. **Reference original requirements**:
   - Check `Sprint_plan.csv` for task definition
   - Review Definition of Done criteria
   - Check KPIs to meet

3. **Implement manually**:
   - Follow existing code patterns
   - Apply TDD (write tests first)
   - Use project conventions from `CLAUDE.md`

4. **Validate thoroughly**:

   ```bash
   pnpm run typecheck
   pnpm run lint
   pnpm run test
   pnpm run test:coverage
   ```

5. **Document the fallback**:
   - Note in PR why AI output failed
   - Update metrics tracking

### 2.4 Phase 4: Review and Merge

1. **Self-review** using `docs/shared/review-checklist.md`
2. **Request peer review** with context on the fallback
3. **Merge** once all checks pass
4. **Verify deployment** if applicable

---

## 3. Rollback Procedures

### 3.1 Git Rollback Commands

#### Rollback Uncommitted Changes

```bash
# Discard all uncommitted changes
git checkout -- .

# Discard specific file
git checkout -- path/to/file.ts

# Stash changes for later review
git stash save "AI output that failed review"
```

#### Rollback Committed (Not Pushed)

```bash
# Soft reset - keep changes staged
git reset --soft HEAD~1

# Mixed reset - keep changes unstaged
git reset HEAD~1

# Hard reset - discard changes completely
git reset --hard HEAD~1
```

#### Rollback Pushed (Feature Branch)

```bash
# Create revert commit
git revert <commit-sha>
git push origin feature/branch-name
```

#### Rollback Merged to Main

```bash
# Revert merge commit (requires -m flag)
git revert <merge-commit-sha> -m 1
git push origin main

# If revert needs its own review:
git checkout -b revert/ai-output-failure
git revert <merge-commit-sha> -m 1
git push origin revert/ai-output-failure
# Create PR for the revert
```

### 3.2 Database Rollback

If AI-generated migrations caused issues:

```bash
# Check migration status
pnpm run db:migrate:status

# Rollback last migration
pnpm run db:migrate:rollback

# Rollback to specific migration
pnpm run db:migrate:rollback --to <migration-name>

# Reset database (DESTRUCTIVE - dev only)
pnpm run db:reset
```

### 3.3 Production Rollback

For production incidents, follow this sequence:

1. **Notify stakeholders** via incident channel
2. **Deploy previous version**:

   ```bash
   # Railway rollback
   railway rollback

   # Or Vercel rollback
   vercel rollback
   ```

3. **Verify service health**
4. **Document in incident log**
5. **Schedule post-mortem**

---

## 4. Escalation Paths

### 4.1 Escalation Matrix

| Severity | Who to Contact               | Response Time | Channel                      |
| -------- | ---------------------------- | ------------- | ---------------------------- |
| Critical | On-call engineer + Tech Lead | Immediate     | PagerDuty + Slack #incidents |
| High     | Tech Lead                    | < 1 hour      | Slack #engineering           |
| Medium   | Team Lead                    | < 4 hours     | Slack #team-channel          |
| Low      | Document and discuss         | Next standup  | GitHub Issue                 |

### 4.2 Critical Escalation Procedure

```
1. PAGE the on-call engineer immediately
   - PagerDuty: intelliflow-critical
   - Phone: [on-call rotation number]

2. NOTIFY in #incidents channel
   - What happened
   - What AI output caused it
   - Current impact
   - What actions are being taken

3. CREATE incident ticket
   - Link to AI output/PR
   - Timeline of events
   - Customer impact assessment

4. START incident call if needed
   - Zoom: [incident room link]
   - Include: On-call, Tech Lead, affected team leads

5. DOCUMENT all actions in incident channel
```

### 4.3 High Severity Escalation

```
1. MESSAGE Tech Lead directly
   - Slack DM with issue summary
   - Link to failing code/PR
   - Your assessment and proposed action

2. CREATE GitHub Issue with labels:
   - `severity: high`
   - `ai-fallback`
   - Relevant component labels

3. BLOCK the problematic PR/code
   - Request changes on PR
   - Mark as "Do Not Merge"

4. SCHEDULE sync call if complex
```

### 4.4 When to Escalate

Escalate immediately if:

- You cannot resolve the issue within 30 minutes
- The issue affects production
- You're unsure about the correct fix
- The fix requires changes outside your area of expertise
- Customer data may be affected
- Security implications exist

---

## 5. Recovery Verification Steps

### 5.1 Verification Checklist

After implementing manual fallback, verify:

#### Code Verification

```bash
# Run full test suite
pnpm run test

# Check coverage
pnpm run test:coverage

# Type checking
pnpm run typecheck

# Linting
pnpm run lint

# Build verification
pnpm run build
```

#### Integration Verification

```bash
# Start all services
pnpm run dev

# Run integration tests
pnpm run test:integration

# Run E2E tests (if applicable)
pnpm run test:e2e
```

#### Performance Verification

```bash
# Run performance benchmarks
pnpm run benchmark

# Check API response times
pnpm run test:performance

# Verify against KPIs from Sprint_plan.csv
```

### 5.2 Verification Documentation

Document verification results:

```json
{
  "fallback_id": "FB-2025-001",
  "original_ai_output": "PR #123",
  "fallback_reason": "Architecture violation - domain imported from adapters",
  "verification": {
    "tests_pass": true,
    "coverage": "92%",
    "type_check": "pass",
    "lint": "pass",
    "build": "pass",
    "performance": {
      "api_p95_ms": 85,
      "target_p95_ms": 100,
      "met": true
    }
  },
  "verified_by": "developer@example.com",
  "verified_at": "2025-12-26T10:30:00Z"
}
```

### 5.3 Post-Recovery Review

After recovery, conduct a brief review:

1. **What went wrong?** Identify root cause
2. **Why did AI output fail?** Was the prompt unclear? Wrong context?
3. **How can we prevent this?** Update prompts, guidelines, or checks
4. **Should we adjust AI usage?** Certain tasks may need manual-first approach

---

## 6. Zero-Regression Validation

### 6.1 Regression Prevention Principles

1. **Never deploy untested AI output** - All AI code must pass full test suite
2. **Maintain coverage thresholds** - Coverage cannot decrease
3. **Performance baselines** - Performance cannot degrade beyond thresholds
4. **Architecture tests** - Must pass all architecture boundary tests
5. **Security scans** - All security checks must pass

### 6.2 Regression Test Suite

Run the full regression suite before and after fallback:

```bash
# Full regression test
pnpm run test:regression

# Specific checks
pnpm run test:unit
pnpm run test:integration
pnpm run test:e2e
pnpm run test:architecture
pnpm run test:security
```

### 6.3 Regression Metrics

Track these metrics to ensure zero regression:

| Metric          | Baseline | Current               | Status    |
| --------------- | -------- | --------------------- | --------- |
| Test Pass Rate  | 100%     | Must be 100%          | Required  |
| Line Coverage   | >= 90%   | Cannot decrease       | Required  |
| Branch Coverage | >= 85%   | Cannot decrease       | Required  |
| API p95 Latency | <= 100ms | Cannot increase > 10% | Required  |
| API p99 Latency | <= 200ms | Cannot increase > 10% | Required  |
| Build Time      | <= 3 min | Cannot increase > 20% | Monitored |
| Bundle Size     | Baseline | Cannot increase > 5%  | Monitored |

### 6.4 Regression Validation Report

Generate after each fallback:

```markdown
## Regression Validation Report

**Fallback ID**: FB-2025-001 **Date**: 2025-12-26 **Validated By**: [Name]

### Test Results

- Unit Tests: PASS (523/523)
- Integration Tests: PASS (89/89)
- E2E Tests: PASS (34/34)
- Architecture Tests: PASS (15/15)

### Coverage Comparison

| Layer       | Before | After | Change |
| ----------- | ------ | ----- | ------ |
| Domain      | 96.2%  | 96.2% | 0.0%   |
| Application | 91.5%  | 91.8% | +0.3%  |
| Overall     | 92.1%  | 92.3% | +0.2%  |

### Performance Comparison

| Metric     | Before | After  | Change |
| ---------- | ------ | ------ | ------ |
| API p95    | 82ms   | 79ms   | -3.7%  |
| API p99    | 165ms  | 158ms  | -4.2%  |
| Build Time | 2m 45s | 2m 42s | -1.8%  |

### Validation Status: PASSED

No regressions detected. Manual fallback implementation meets all quality
standards.
```

---

## 7. Fallback Log Template

Maintain a log of all fallbacks for process improvement:

```json
{
  "fallback_log": [
    {
      "id": "FB-2025-001",
      "date": "2025-12-26",
      "task_id": "IFC-XXX",
      "ai_tool": "Claude Code",
      "failure_category": "architecture_violation",
      "failure_description": "Domain layer imported infrastructure adapter directly",
      "time_to_detect": "15 minutes",
      "time_to_resolve": "45 minutes",
      "resolution": "manual_rewrite",
      "regression_status": "none",
      "lessons_learned": "Add architecture test for this specific import pattern",
      "follow_up_actions": [
        "Add ArchUnit test for domain imports",
        "Update AI prompt to explicitly forbid infrastructure imports in domain"
      ]
    }
  ]
}
```

---

## 8. Quick Reference Card

Print this for quick access during incidents:

```
FALLBACK QUICK REFERENCE
========================

IMMEDIATE ACTIONS:
1. STOP - Don't propagate the issue further
2. ASSESS - What failed? How severe?
3. CONTAIN - Revert/block as needed
4. ESCALATE - If Critical/High, notify immediately

GIT ROLLBACK:
- Uncommitted: git checkout -- .
- Committed: git reset HEAD~1
- Pushed: git revert <sha>
- Merged: git revert <sha> -m 1

CRITICAL ESCALATION:
- PagerDuty: intelliflow-critical
- Slack: #incidents
- Phone: [on-call number]

VERIFICATION:
1. pnpm run test
2. pnpm run typecheck
3. pnpm run lint
4. pnpm run build

ZERO REGRESSION:
- Tests: Must be 100% pass
- Coverage: Cannot decrease
- Performance: Cannot degrade > 10%
```

---

## Related Documents

- `docs/shared/ai-review-checklist.md` - AI output review criteria
- `docs/shared/review-checklist.md` - General PR review checklist
- `docs/operations/incident-response.md` - Full incident response procedure
- `CLAUDE.md` - Project conventions and architecture
