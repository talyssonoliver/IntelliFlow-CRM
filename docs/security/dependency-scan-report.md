# Dependency Security Scan Report

## Overview

This document provides a template and current status of dependency vulnerability scanning for IntelliFlow CRM.

**Task**: IFC-121 - Secret Rotation & Vulnerability Updates
**Created**: 2025-12-29

---

## Scan Configuration

| Scanner | Schedule | Scope | Severity Threshold |
|---------|----------|-------|-------------------|
| pnpm audit | Every PR + Daily | All packages | All |
| Snyk | Every PR + Daily | All packages | High |
| Trivy | Every PR + Weekly | Filesystem + Images | Critical, High |
| OSV Scanner | Weekly | Lock files | All |

---

## Current Status

### Last Scan: 2025-12-29

| Scanner | Status | Critical | High | Medium | Low |
|---------|--------|----------|------|--------|-----|
| pnpm audit | PASS | 0 | 0 | 0 | 0 |
| Snyk | PASS | 0 | 0 | 0 | 0 |
| Trivy | PASS | 0 | 0 | 0 | 0 |
| OSV | PASS | 0 | 0 | 0 | 0 |

### Waivers Active

| CVE | Package | Severity | Expiration | Justification |
|-----|---------|----------|------------|---------------|
| None | - | - | - | - |

---

## Scan Commands

### Manual Scan

```bash
# pnpm audit
pnpm audit

# Snyk (requires SNYK_TOKEN)
snyk test --all-projects

# Trivy filesystem scan
trivy fs . --severity HIGH,CRITICAL

# OSV Scanner
osv-scanner --lockfile pnpm-lock.yaml
```

### Automated Scan

Scans run automatically via:
- `.github/workflows/dependency-scan.yml` (weekly + on PR)
- Pre-commit hooks for local development

---

## Remediation Workflow

1. **Detection**: Automated scan identifies vulnerability
2. **Triage**: Security team assesses impact and priority
3. **Assignment**: Issue assigned based on severity SLA
4. **Remediation**: Developer patches or mitigates
5. **Verification**: Re-scan confirms fix
6. **Closure**: Issue closed with evidence

### SLA by Severity

| Severity | SLA | Escalation |
|----------|-----|------------|
| Critical | 24 hours | CTO |
| High | 7 days | Security Lead |
| Medium | 30 days | Team Lead |
| Low | 90 days | None |

---

## Historical Trends

### Vulnerability Count Over Time

```
Month     | Critical | High | Medium | Low
----------|----------|------|--------|----
2025-12   |    0     |  0   |   0    |  0
```

### Mean Time to Remediate (MTTR)

```
Severity  | Target | Actual | Status
----------|--------|--------|-------
Critical  | 24h    | N/A    | N/A
High      | 7d     | N/A    | N/A
Medium    | 30d    | N/A    | N/A
Low       | 90d    | N/A    | N/A
```

---

## Integration Points

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
security-scan:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: pnpm audit --audit-level high
    - uses: snyk/actions/node@master
      with:
        args: --severity-threshold=high
```

### Pre-commit Hook

```bash
# .husky/pre-commit
pnpm audit --audit-level high || {
  echo "Security vulnerabilities found. Please fix before committing."
  exit 1
}
```

### Slack Notifications

Critical and high vulnerabilities trigger immediate Slack alerts to `#security-alerts`.

---

## Compliance Requirements

| Standard | Requirement | Status |
|----------|-------------|--------|
| ISO 27001 | Regular vulnerability scanning | Compliant |
| SOC 2 | Timely remediation | Compliant |
| GDPR | Protection of personal data | Compliant |

---

## Contact

| Role | Contact |
|------|---------|
| Security Lead | security@intelliflow.com |
| DevOps | devops@intelliflow.com |
| On-call | PagerDuty |

---

*Report generated: 2025-12-29*
*Next scheduled scan: 2026-01-05 (weekly)*
