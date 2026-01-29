# Refactoring Backlog

**Task ID**: IFC-054
**Last Updated**: 2025-12-28
**Owner**: CTO + Tech Lead (STOA-Foundation)
**Review Frequency**: Weekly

---

## Overview

This document tracks technical debt items and refactoring priorities for the IntelliFlow CRM codebase. Items are prioritized based on impact, effort, and risk, following the technical complexity monitoring framework established in IFC-054.

---

## Backlog Categories

### Priority Levels
- **P1 (Critical)**: Must be addressed within current sprint - blocks development or poses security risk
- **P2 (High)**: Should be addressed within 2 sprints - significantly impacts velocity or maintainability
- **P3 (Medium)**: Should be addressed within 4 sprints - moderate impact on codebase health
- **P4 (Low)**: Nice to have - can be addressed opportunistically

### Effort Estimates
- **XS**: < 2 hours
- **S**: 2-4 hours
- **M**: 4-8 hours (1 day)
- **L**: 8-16 hours (2 days)
- **XL**: > 16 hours (requires spike/breakdown)

---

## Active Refactoring Items

### P1 - Critical (Must Fix)

| ID | Description | Location | Effort | Status | Sprint |
|----|-------------|----------|--------|--------|--------|
| REF-001 | N/A - No critical items currently | - | - | - | - |

### P2 - High Priority

| ID | Description | Location | Effort | Status | Sprint |
|----|-------------|----------|--------|--------|--------|
| REF-010 | Split monolithic router file | `apps/api/src/router.ts` | M | Planned | 8 |
| REF-011 | Extract dashboard components | `apps/web/src/app/dashboard/page.tsx` | S | Planned | 8 |
| REF-012 | Improve test coverage for adapters | `packages/adapters/src/**` | L | Planned | 9 |

### P3 - Medium Priority

| ID | Description | Location | Effort | Status | Sprint |
|----|-------------|----------|--------|--------|--------|
| REF-020 | Document public API interfaces | `packages/*/src/index.ts` | M | Backlog | - |
| REF-021 | Reduce Opportunity aggregate complexity | `packages/domain/src/crm/opportunity/` | M | Backlog | - |
| REF-022 | Consolidate shared validation logic | `packages/validators/src/` | S | Backlog | - |
| REF-023 | Add JSDoc to domain entities | `packages/domain/src/**` | L | Backlog | - |

### P4 - Low Priority

| ID | Description | Location | Effort | Status | Sprint |
|----|-------------|----------|--------|--------|--------|
| REF-030 | Remove orphan files | Various | XS | Backlog | - |
| REF-031 | Standardize error handling patterns | Various | M | Backlog | - |
| REF-032 | Add more inline comments for complex logic | Various | S | Backlog | - |

---

## Tech Debt Metrics

### Current State (as of 2025-12-28)

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Tech Debt Ratio | 6.8% | <10% | OK |
| Code Smells | 45 | <50 | OK |
| Duplications | 12 | <15 | OK |
| Security Hotspots | 3 | 0 | Needs Attention |
| Test Coverage | 78.5% | >80% | Needs Attention |

### Trend Analysis

| Week | Tech Debt Ratio | Code Smells | Coverage |
|------|-----------------|-------------|----------|
| W52 2025 | 6.8% | 45 | 78.5% |

---

## Refactoring Process

### 1. Identification
- Weekly complexity metrics review (IFC-054)
- SonarQube quality gate reports
- Developer feedback during code reviews
- Performance profiling results

### 2. Prioritization Criteria

| Factor | Weight | Description |
|--------|--------|-------------|
| Impact | 40% | How much does this affect development velocity? |
| Risk | 30% | Does this pose security or reliability risks? |
| Effort | 20% | How much work is required? |
| Dependencies | 10% | Does this block other work? |

### 3. Execution Guidelines

1. **Create a Spike** (if XL effort)
   - Break down into smaller tasks
   - Identify risks and dependencies
   - Get team consensus before proceeding

2. **Write Tests First**
   - Ensure existing behavior is captured
   - Add regression tests before refactoring
   - Target 90%+ coverage for affected code

3. **Incremental Changes**
   - Make small, reviewable PRs
   - Keep changes atomic and reversible
   - Document breaking changes clearly

4. **Validate**
   - Run full test suite
   - Check complexity metrics improved
   - Verify no performance regression

### 4. Completion Criteria

A refactoring item is considered complete when:
- [ ] Code changes are merged to main
- [ ] Tests pass (90%+ coverage)
- [ ] Complexity metrics show improvement
- [ ] Documentation is updated
- [ ] No regression in performance
- [ ] Code review approved by 2+ reviewers

---

## Weekly Review Checklist

- [ ] Review complexity-metrics.json for new hotspots
- [ ] Check SonarQube quality gate status
- [ ] Review and prioritize new tech debt items
- [ ] Update backlog item statuses
- [ ] Validate completed refactoring items
- [ ] Update trend metrics

---

## Related Documents

- [Complexity Metrics](../../artifacts/metrics/complexity-metrics.json)
- [SonarQube Debt Report](../../artifacts/reports/sonarqube-debt-report.html)
- [Team Velocity](../../artifacts/misc/team-velocity.csv)
- [Quality Gates](../operations/quality-gates.md)
- [TDD Guidelines](../tdd-guidelines.md)

---

## Appendix: Common Refactoring Patterns

### A. Extract Component/Module
When a file exceeds 300 LOC or has cyclomatic complexity > 10

### B. Introduce Facade
When multiple callers use the same set of lower-level APIs

### C. Replace Conditional with Polymorphism
When switch/case statements grow beyond 5 branches

### D. Extract Domain Service
When business logic appears in multiple aggregates

### E. Consolidate Duplicate Code
When similar logic appears in 3+ locations (DRY principle)

---

*This document is automatically referenced by the technical complexity monitoring system (IFC-054). Updates should be made through the weekly assessment process.*
