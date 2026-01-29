# Container Image Scanning Policy

**Status:** Implemented (Sprint 7)
**Related Task:** IFC-134
**Dependencies:** ENV-003-AI (Docker Setup), ENV-005-AI (CI/CD Pipeline)
**Owner:** Security Engineer (STOA-Security)

## Overview

This document defines the container image scanning policy for IntelliFlow CRM,
ensuring all deployable container images are scanned for vulnerabilities before
deployment to any environment.

## Scanning Tool: Trivy

IntelliFlow CRM uses [Trivy](https://github.com/aquasecurity/trivy) by Aqua
Security for container image scanning. Trivy is chosen for:

- **Comprehensive scanning**: OS packages, language dependencies, misconfigurations
- **Speed**: Fast scanning with local vulnerability database
- **CI/CD integration**: Native GitHub Actions support
- **Industry adoption**: Widely used in production environments

## Scanning Process

### 1. Build-Time Scanning

Every container image build triggers an automatic vulnerability scan:

```
[Build Image] -> [Trivy Scan] -> [Policy Check] -> [Push to Registry/Fail]
```

**Workflow Location:** `.github/workflows/image-scan.yml`

### 2. Severity Thresholds

| Severity | Action | Blocking |
|----------|--------|----------|
| CRITICAL | Block build | Yes |
| HIGH | Warn, log for review | No (configurable) |
| MEDIUM | Log for awareness | No |
| LOW | Log only | No |

**Default Policy:** Fail on CRITICAL vulnerabilities (exit-code 1)

### 3. Scan Targets

All images built by the CI/CD pipeline are scanned:

| Image | Context | Scan Trigger |
|-------|---------|--------------|
| `intelliflow-api` | `apps/api/` | Push to main/develop |
| `intelliflow-web` | `apps/web/` | Push to main/develop |
| `intelliflow-ai-worker` | `apps/ai-worker/` | Push to main/develop |
| Third-party base images | - | Weekly scheduled scan |

## Vulnerability Management

### Response SLAs

Per the security baseline (`artifacts/misc/security-baseline.json`):

| Severity | Remediation SLA | Escalation Path |
|----------|-----------------|-----------------|
| CRITICAL | 24 hours | Block deployment, page on-call |
| HIGH | 7 days | Create ticket, notify team |
| MEDIUM | 30 days | Add to backlog |
| LOW | 90 days | Track in vulnerability report |

### Remediation Process

1. **Automated Detection:** Trivy scan identifies vulnerabilities
2. **Triage:** Security team reviews and validates findings
3. **Fix or Mitigate:**
   - Update base image to patched version
   - Update vulnerable dependency
   - Apply workaround if patch unavailable
   - Document exception if accepting risk
4. **Verify:** Re-scan to confirm remediation
5. **Close:** Update vulnerability tracking

## Exception Process

### When Exceptions Are Needed

Exceptions may be requested when:

- No patch is available from upstream
- False positive confirmed after investigation
- Vulnerability is not exploitable in our context
- Breaking change prevents immediate upgrade

### Exception Request Requirements

Submit an exception request via the security exception process:

1. **Risk Assessment:**
   - CVE ID and severity
   - CVSS score and attack vector
   - Exploitability in our environment
   - Compensating controls in place

2. **Justification:**
   - Why the vulnerability cannot be fixed immediately
   - Timeline for permanent fix
   - Business impact of blocking vs. accepting

3. **Approval Chain:**
   - Security Engineer review
   - Engineering Lead approval
   - CTO sign-off for CRITICAL exceptions

### Exception File Format

Create exception files in `.trivyignore` format:

```yaml
# .trivyignore - Trivy vulnerability exceptions
# Format: CVE-ID  # Reason, Expiry: YYYY-MM-DD

# Example: False positive - not using affected function
CVE-2024-XXXXX  # False positive - function not called, Expiry: 2025-03-01

# Example: Awaiting upstream patch
CVE-2024-YYYYY  # No patch available, tracking issue #123, Expiry: 2025-02-15
```

**Exception Rules:**
- All exceptions must have an expiry date (max 90 days for CRITICAL)
- Exceptions are reviewed in weekly security standup
- Expired exceptions are removed automatically by CI

## Registry Scanning

### Continuous Monitoring

In addition to build-time scanning, registry images are scanned:

- **Frequency:** Nightly at 02:00 UTC
- **Scope:** All images in production registry
- **Output:** Vulnerability report emailed to security team

### Stale Image Policy

Images not updated within 90 days are flagged for review:

- Check if still in use
- Update base image if needed
- Archive if no longer deployed

## CI/CD Integration

### GitHub Workflow

The `image-scan.yml` workflow integrates scanning into the build pipeline:

```yaml
# Simplified flow
jobs:
  build-and-scan:
    - Build Docker image
    - Scan with Trivy (fail on CRITICAL)
    - Generate SARIF report
    - Upload to GitHub Security
    - Push to registry (if passed)
```

### Scan Reports

| Report Type | Location | Retention |
|-------------|----------|-----------|
| SARIF | GitHub Security tab | 30 days |
| JSON | Artifact: `trivy-results-*.json` | 90 days |
| Table | GitHub Actions log | 30 days |

### Integration with Existing Workflows

| Workflow | Integration Point |
|----------|-------------------|
| `ci.yml` | Build job outputs image for scanning |
| `security-sbom.yml` | SBOM includes container components |
| `cd.yml` | Scan gate before production deploy |

## Metrics and KPIs

### Target Metrics (IFC-134)

| KPI | Target | Measurement |
|-----|--------|-------------|
| Critical vulns in prod images | 0 | Trivy scan results |
| Scan coverage for deployable images | 100% | CI/CD pipeline logs |
| Mean time to remediate CRITICAL | <24 hours | Ticket tracking |
| Mean time to remediate HIGH | <7 days | Ticket tracking |

### Reporting

Weekly vulnerability report includes:

- New vulnerabilities discovered
- Vulnerabilities remediated
- Outstanding exceptions
- Scan coverage metrics

## Local Development

### Scanning Local Images

Developers can scan images locally before pushing:

```bash
# Install Trivy (one-time)
# macOS
brew install trivy

# Windows (Chocolatey)
choco install trivy

# Linux
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# Scan a local image
trivy image --severity CRITICAL,HIGH intelliflow-api:latest

# Scan with the same policy as CI
trivy image --severity CRITICAL --exit-code 1 intelliflow-api:latest
```

### Pre-commit Hook (Optional)

Developers can add image scanning to their pre-push workflow:

```bash
# .git/hooks/pre-push (make executable)
#!/bin/bash
if docker images intelliflow-* -q | head -1; then
  trivy image --severity CRITICAL --exit-code 1 $(docker images intelliflow-* -q | head -1)
fi
```

## Compliance Mapping

This policy addresses the following compliance requirements:

| Framework | Control | How Addressed |
|-----------|---------|---------------|
| OWASP A06 | Vulnerable Components | Automated CVE scanning |
| OWASP A08 | Software Integrity | Image verification before deploy |
| ISO 27001 | A.14.2.2 | System change control procedures |
| SOC 2 | CC6.6 | Logical access security software |

## References

- [Trivy Documentation](https://aquasecurity.github.io/trivy/)
- [GitHub Security Scanning](https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning)
- [OWASP Container Security](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- [IntelliFlow Zero Trust Design](./zero-trust-design.md)
- [IntelliFlow OWASP Checklist](./owasp-checklist.md)
- [IntelliFlow Supply Chain Policy](./supply-chain.md)

---

**Document Status:** Active
**Created:** 2025-12-28
**Last Review:** 2025-12-28
**Next Review:** 2026-03-28 (Quarterly)
**Owner:** Security Team
**Approver:** STOA-Security
