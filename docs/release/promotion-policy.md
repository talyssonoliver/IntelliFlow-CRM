# Release Promotion Policy

> **Task**: IFC-130 - Release governance: staging auto-deploy, promotion policy, quality/security gates, rollback criteria
> **Status**: Completed
> **Sprint**: 5

## Overview

This document defines the release promotion workflow for IntelliFlow CRM, ensuring safe and reliable deployments through automated quality gates and human approvals.

## Environment Hierarchy

```
Development → Staging → Production
```

| Environment | Purpose | Auto-Deploy | Approval Required |
|-------------|---------|-------------|-------------------|
| Development | Feature testing | Yes (on PR merge to `develop`) | No |
| Staging | Pre-production validation | Yes (on merge to `main`) | No |
| Production | Live system | No | Yes (manual gate) |

## Promotion Workflow

### 1. Development → Staging (Automatic)

**Trigger**: Merge to `main` branch

**Automated Checks**:
- All CI tests pass (unit, integration, E2E)
- Code coverage ≥90%
- No critical/high security vulnerabilities (Snyk/Dependabot)
- Linting passes with zero errors
- Build succeeds for all packages
- Architecture tests pass (no boundary violations)

**Deployment**:
- Automatic blue-green deployment
- Health checks must pass within 2 minutes
- Automatic rollback if health checks fail

### 2. Staging → Production (Manual Approval)

**Trigger**: Manual promotion request

**Pre-Promotion Checklist**:
1. [ ] Staging deployment stable for ≥24 hours
2. [ ] All automated tests pass in staging
3. [ ] Performance benchmarks within acceptable range
4. [ ] Security scan clean (zero critical issues)
5. [ ] Database migrations tested and reversible
6. [ ] Feature flags configured correctly
7. [ ] Monitoring and alerting verified

**Approval Requirements**:
- At least 1 approval from Tech Lead or DevOps Lead
- All blocking issues resolved
- Release notes documented

**Deployment**:
- Blue-green deployment with gradual traffic shift
- 10% → 50% → 100% traffic rollout
- Each phase requires health check validation
- Automatic rollback on error rate >1%

## Quality Gates

### Automated Gates

| Gate | Threshold | Enforcement |
|------|-----------|-------------|
| Unit Test Coverage | ≥90% | CI blocks merge |
| Integration Tests | 100% pass | CI blocks merge |
| E2E Tests | 100% pass | CI blocks merge |
| Security Scan | 0 critical, 0 high | CI blocks merge |
| Performance (p99) | <200ms API response | CI warning, manual review |
| Lighthouse Score | ≥90 | CI blocks merge |
| Bundle Size | <500KB initial load | CI warning |

### Manual Gates

| Gate | Reviewer | Required For |
|------|----------|--------------|
| Architecture Review | Tech Lead | New features |
| Security Review | Security Engineer | Auth/data changes |
| UX Review | UX Lead | UI changes |
| Performance Review | SRE | Infrastructure changes |

## Rollback Criteria

### Automatic Rollback Triggers

- Health check failure (3 consecutive failures)
- Error rate >1% for 5 minutes
- Response latency p99 >500ms for 5 minutes
- Memory usage >90% for 5 minutes
- CPU usage >80% sustained for 10 minutes

### Manual Rollback Triggers

- Critical bug discovered in production
- Security incident
- Data integrity issue
- Business-critical feature failure

## Rollback Procedure

1. **Immediate**: Previous version restored within 2 minutes
2. **Database**: Migrations have corresponding down migrations
3. **Feature Flags**: Disable problematic features without full rollback
4. **Communication**: Status page updated, stakeholders notified

## SLAs

| Metric | Target | Monitoring |
|--------|--------|------------|
| Staging Deploy Time | ≤5 minutes | GitHub Actions |
| Production Deploy Time | ≤10 minutes | GitHub Actions |
| Rollback Time | ≤2 minutes | Automated |
| MTTR | ≤1 hour | PagerDuty |

## Release Schedule

- **Feature Releases**: Tuesday/Wednesday (business hours)
- **Hotfixes**: Any time (with on-call approval)
- **Freeze Periods**: Major holidays, end-of-month processing

## Related Documents

- [Release Checklist](./runbooks/release-checklist.md)
- [Quality Gates](../operations/quality-gates.md)
- [Release Rollback](../operations/release-rollback.md)
- [CI/CD Workflow](.github/workflows/ci.yml)
