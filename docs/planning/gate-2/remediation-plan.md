# Gate 2 Remediation Plan

## Document Metadata

- **Task ID**: IFC-027
- **Gate**: Gate 2 (£2000 Investment)
- **Created**: 2026-01-30
- **Author**: STOA-Quality + STOA-Foundation
- **Status**: Active - T1 Release Condition

---

## Executive Summary

This remediation plan addresses the quality gaps identified during the IFC-027
spec session. The plan provides a structured approach to resolve blockers before
full Gate 2 investment release.

### Critical Discovery

The spec session uncovered a **30 percentage point discrepancy** between
documented coverage (90%+) and actual coverage (60.49%). This document outlines
the path to resolution.

---

## Blockers Identified

### 1. TypeScript Compilation Failures (HIGH)

| Attribute      | Value                                      |
| -------------- | ------------------------------------------ |
| **Severity**   | HIGH - Blocks T2 Release                   |
| **Package**    | `@intelliflow/adapters`                    |
| **Root Cause** | Type mismatches after domain layer updates |
| **Deadline**   | W1 (T2 - 2 weeks)                          |

**Validation Command**:

```bash
pnpm run typecheck
# Or package-specific:
pnpm --filter @intelliflow/adapters typecheck
```

**Expected Exit Code**: 0

### 2. Test Coverage Gap (HIGH)

| Attribute            | Value                       |
| -------------------- | --------------------------- |
| **Severity**         | HIGH - Blocks T2/T3 Release |
| **Current Coverage** | 60.49%                      |
| **T2 Target**        | 80%                         |
| **T3 Target**        | 90%                         |
| **Gap**              | 19.51% to T2, 29.51% to T3  |

**Coverage Breakdown by Layer**:

| Layer       | Current | Target | Gap  | Priority |
| ----------- | ------- | ------ | ---- | -------- |
| Domain      | ~65%    | 95%    | ~30% | P1       |
| Application | ~55%    | 90%    | ~35% | P1       |
| Adapters    | ~50%    | 85%    | ~35% | P2       |
| API Routes  | ~70%    | 85%    | ~15% | P3       |

**Validation Command**:

```bash
pnpm run test:unit --coverage
# Check result:
cat artifacts/coverage/coverage-summary.json | jq '.total.lines.pct'
```

### 3. Authenticated Benchmark Failures (HIGH)

| Attribute                | Value                            |
| ------------------------ | -------------------------------- |
| **Severity**             | HIGH - Blocks T3 Release         |
| **Current Success Rate** | ~33% (67% failure)               |
| **Target**               | >95%                             |
| **Root Cause**           | Missing JWT tokens in k6 scripts |

**Validation Command**:

```bash
npx tsx tools/scripts/gate-2/validate-benchmarks.ts
```

### 4. AI Accuracy Ground Truth (MEDIUM)

| Attribute         | Value                                 |
| ----------------- | ------------------------------------- |
| **Severity**      | MEDIUM - Blocks T3 Release            |
| **Current State** | No baseline defined                   |
| **Target**        | 85% accuracy with 500+ sample dataset |
| **Deadline**      | W3-W4                                 |

---

## Remediation Timeline

### Week 0: Immediate (T1 Release)

| Task                         | Owner      | Deliverable                            | Status |
| ---------------------------- | ---------- | -------------------------------------- | ------ |
| Accept remediation plan      | Leadership | This document approved                 | ☐      |
| Acknowledge data discrepancy | Quality    | Updated analysis doc                   | ☐      |
| Create validation scripts    | Foundation | `tools/scripts/gate-2/*.ts`            | ✓      |
| Document NPV assumptions     | Finance    | `docs/planning/financial/npv-model.md` | ✓      |

**T1 Release Condition**: Plan accepted, discrepancy acknowledged.

### Week 1: TypeScript Fix

| Task                   | Owner        | Deliverable      | Validation                                      |
| ---------------------- | ------------ | ---------------- | ----------------------------------------------- |
| Audit adapters package | Backend Lead | Error inventory  | `pnpm typecheck 2>&1 \| wc -l`                  |
| Fix type mismatches    | Backend Team | Code changes     | `pnpm --filter @intelliflow/adapters typecheck` |
| Update dependent types | Full Stack   | Type definitions | `pnpm run typecheck`                            |
| Verify all packages    | DevOps       | CI green         | GitHub Actions pass                             |

**Success Criteria**: `pnpm run typecheck` exits with code 0.

### Week 2: Coverage to 80% (T2 Release)

| Task                   | Owner       | Deliverable         | Validation                |
| ---------------------- | ----------- | ------------------- | ------------------------- |
| Identify coverage gaps | QA          | Gap analysis report | Coverage diff             |
| Add domain layer tests | Domain Team | Unit tests          | Domain >95%               |
| Add application tests  | App Team    | Integration tests   | App >90%                  |
| Verify T2 threshold    | QA          | Coverage report     | `validate-coverage.ts T2` |

**T2 Release Condition**: Coverage ≥80%, typecheck green, lint green.

### Week 3: AI Accuracy Baseline

| Task                      | Owner   | Deliverable         | Validation          |
| ------------------------- | ------- | ------------------- | ------------------- |
| Define accuracy protocol  | AI Team | Measurement spec    | Doc reviewed        |
| Create golden dataset     | AI Team | 500+ samples        | File exists         |
| Establish baseline        | AI Team | Accuracy metrics    | Baseline documented |
| Implement regression test | QA      | Accuracy test suite | Tests pass          |

**Golden Dataset Location**: `tests/fixtures/ai/golden-dataset.json`

### Week 4: Full Remediation (T3 Release)

| Task               | Owner     | Deliverable      | Validation                |
| ------------------ | --------- | ---------------- | ------------------------- |
| Coverage to 90%    | All Teams | Additional tests | `validate-coverage.ts T3` |
| Fix benchmark auth | DevOps    | k6 with JWT      | `validate-benchmarks.ts`  |
| Verify all gates   | QA        | Full validation  | All scripts pass          |
| Update metrics     | PM        | Accurate docs    | Discrepancies resolved    |

**T3 Release Condition**: Coverage ≥90%, AI accuracy baseline, benchmarks >95%.

---

## Ownership Matrix

| Area                 | Primary Owner   | Backup         | Escalation |
| -------------------- | --------------- | -------------- | ---------- |
| TypeScript/Types     | Backend Lead    | Senior Dev     | CTO        |
| Domain Coverage      | Domain Expert   | Backend Lead   | Tech Lead  |
| Application Coverage | Full Stack Lead | Domain Expert  | Tech Lead  |
| Benchmark Auth       | DevOps          | Backend Lead   | CTO        |
| AI Accuracy          | AI Specialist   | Data Scientist | CTO        |
| Documentation        | PM              | QA Lead        | CFO        |

---

## Success Metrics

### T1 Release Checklist

- [ ] Remediation plan document created
- [ ] Remediation plan reviewed by leadership
- [ ] Data discrepancy acknowledged in writing
- [ ] Validation scripts deployed
- [ ] NPV documentation complete

### T2 Release Checklist

- [ ] `pnpm run typecheck` returns exit code 0
- [ ] `pnpm run lint` returns exit code 0
- [ ] Domain layer coverage ≥95%
- [ ] Application layer coverage ≥90%
- [ ] Overall coverage ≥80%
- [ ] `validate-coverage.ts T2` passes

### T3 Release Checklist

- [ ] Overall coverage ≥90%
- [ ] AI golden dataset (500+ samples) created
- [ ] AI accuracy baseline documented
- [ ] `validate-benchmarks.ts` passes (>95% success)
- [ ] All acceptance criteria verified
- [ ] Gate 2 marked complete in Sprint_plan.csv

---

## Progress Tracking

### Weekly Check-ins

| Week | Date       | Coverage | Typecheck | Benchmarks | AI Baseline |
| ---- | ---------- | -------- | --------- | ---------- | ----------- |
| W0   | 2026-01-30 | 60.49%   | FAIL      | 33%        | None        |
| W1   | 2026-02-06 | TBD      | TBD       | TBD        | TBD         |
| W2   | 2026-02-13 | TBD      | TBD       | TBD        | TBD         |
| W3   | 2026-02-20 | TBD      | TBD       | TBD        | TBD         |
| W4   | 2026-02-27 | TBD      | TBD       | TBD        | TBD         |

### Automated Tracking

Coverage reports are generated on every PR merge:

- Location: `artifacts/coverage/coverage-summary.json`
- Dashboard: http://localhost:3002/metrics

---

## Risk Mitigation

### If Coverage Trajectory Stalls

1. **Week 2 Check**: If <70%, escalate to tech leads
2. **Focus Shift**: Prioritize critical path coverage
3. **Scope Reduction**: Defer non-essential code
4. **Extended Timeline**: Request T2 extension if needed

### If TypeScript Fixes Break Tests

1. **Rollback Strategy**: Revert to last green state
2. **Incremental Fixes**: Smaller PRs, more reviews
3. **Pair Programming**: Complex type issues

### If AI Accuracy Falls Short

1. **Adjust Target**: 80% if 85% unachievable
2. **Extend Timeline**: Additional 2 weeks for tuning
3. **Human Oversight**: Increase human-in-loop rate

---

## Communication Plan

| Event              | Audience         | Channel     | Frequency |
| ------------------ | ---------------- | ----------- | --------- |
| Progress Update    | Leadership       | Email       | Weekly    |
| Blocker Escalation | CTO              | Slack       | Immediate |
| Coverage Report    | Engineering      | PR Comments | Per PR    |
| Gate Status        | All Stakeholders | Dashboard   | Real-time |

---

## Appendix: Validation Scripts

### TypeCheck Validation

```bash
npx tsx tools/scripts/gate-2/validate-typecheck.ts
```

### Coverage Validation

```bash
npx tsx tools/scripts/gate-2/validate-coverage.ts T2  # For T2
npx tsx tools/scripts/gate-2/validate-coverage.ts T3  # For T3
```

### Benchmark Validation

```bash
npx tsx tools/scripts/gate-2/validate-benchmarks.ts
```

### Full Gate Validation

```bash
pnpm run typecheck && \
pnpm run lint && \
npx tsx tools/scripts/gate-2/validate-coverage.ts T3 && \
npx tsx tools/scripts/gate-2/validate-benchmarks.ts
```

---

_Document created for IFC-027 Gate 2 Review_ _T1 Release Condition: Remediation
plan accepted_
