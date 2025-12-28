# Supply Chain Security Policy

**Status**: Implemented (Sprint 7)
**Related Tasks**: IFC-132 (SBOM), IFC-133 (Signing)
**Owner**: Security Team
**Last Updated**: 2025-12-28
**Review Frequency**: Quarterly

## Overview

This document defines IntelliFlow CRM's supply chain security policy, covering
dependency management, Software Bill of Materials (SBOM) generation, artifact
signing, and update review requirements. The goal is to ensure all third-party
dependencies are tracked, verified, and maintained securely, and all build
artifacts are cryptographically signed with verifiable provenance.

## Table of Contents

1. [Dependency Pinning Policy](#dependency-pinning-policy)
2. [SBOM Generation](#sbom-generation)
3. [Artifact Signing](#artifact-signing)
4. [Update Review Requirements](#update-review-requirements)
5. [Vulnerability Response](#vulnerability-response)
6. [License Compliance](#license-compliance)
7. [Audit Trail](#audit-trail)

---

## Dependency Pinning Policy

### Lockfile Requirements

All dependencies MUST be pinned via `pnpm-lock.yaml`:

- **Production dependencies**: Exact versions locked in lockfile
- **Development dependencies**: Exact versions locked in lockfile
- **CI/CD installations**: MUST use `--frozen-lockfile` flag

```bash
# Correct: Install with frozen lockfile
pnpm install --frozen-lockfile

# Incorrect: Never use in CI/CD
pnpm install  # May update lockfile
```

### Version Specification Guidelines

| Dependency Type | Recommended Specifier | Example |
|-----------------|----------------------|---------|
| Critical/Security | Exact version | `"express": "4.18.2"` |
| Production | Caret (minor updates) | `"react": "^18.2.0"` |
| Development | Caret (minor updates) | `"vitest": "^4.0.0"` |
| Peer dependencies | Range | `"react": ">=17.0.0"` |

### Lockfile Integrity

The `pnpm-lock.yaml` file:

- MUST be committed to version control
- MUST NOT be manually edited
- MUST be regenerated via `pnpm install` when updating dependencies
- Is verified in CI via the `security-sbom.yml` workflow

### Prohibited Patterns

The following patterns are **NOT ALLOWED**:

```json
{
  "dependencies": {
    "some-package": "*",           // Never use wildcards
    "some-package": "latest",      // Never use latest
    "some-package": ">=1.0.0"      // Avoid open-ended ranges in prod
  }
}
```

---

## SBOM Generation

### Overview

A Software Bill of Materials (SBOM) is generated for every build to provide
complete visibility into all software components and dependencies.

### Generation Process

**Workflow**: `.github/workflows/security-sbom.yml`

The SBOM is automatically generated:

- On every push to `main` or `develop`
- On every pull request to `main` or `develop`
- On every release
- On manual workflow dispatch

### Tools Used

| Tool | Purpose | Format Output |
|------|---------|---------------|
| **Syft** (Anchore) | Primary SBOM generator | CycloneDX 1.5, SPDX |
| **license-checker** | License compliance | JSON |
| **pnpm audit** | Vulnerability scanning | JSON |

### SBOM Formats

Generated SBOMs are available in multiple formats:

1. **CycloneDX 1.5 JSON** (`*.cyclonedx.json`)
   - Primary format for machine consumption
   - Compatible with most vulnerability scanners
   - Recommended for integration with security tools

2. **SPDX JSON** (`*.spdx.json`)
   - Alternative standard format
   - Required for certain compliance frameworks
   - Suitable for legal/licensing review

3. **Plain Text** (`*.txt`)
   - Human-readable summary
   - Quick reference for developers

### Storage and Retention

| Artifact Type | Retention Period | Location |
|---------------|------------------|----------|
| Build SBOMs | 90 days | GitHub Actions Artifacts |
| Release SBOMs | 365 days | GitHub Releases + Artifacts |
| Audit Reports | 30 days | GitHub Actions Artifacts |

### SBOM Content

Each SBOM includes:

- All npm/pnpm dependencies (direct and transitive)
- Package versions with integrity hashes
- License information
- Source URLs
- Dependency relationships

### Accessing SBOMs

```bash
# Download SBOM from GitHub Actions artifacts
gh run download <run-id> -n sbom-intelliflow-crm-*

# Or via the GitHub UI:
# Actions > Workflow Run > Artifacts > sbom-intelliflow-crm-*
```

---

## Artifact Signing

### Overview (IFC-133)

All production-bound artifacts are cryptographically signed using Sigstore's
cosign tool with SLSA provenance attestations. This ensures artifact authenticity
and provides a verifiable chain of custody from build to deployment.

**Workflow**: `.github/workflows/signing.yml`

### What Gets Signed

| Artifact Type | Signing Method | Storage |
|---------------|----------------|---------|
| Release Archives | Cosign keyless | GitHub Releases |
| Container Images | Cosign keyless | GitHub Container Registry |
| SBOM Files | Cosign attestation | GitHub Artifacts |

### Keyless Signing

We use Sigstore's keyless signing with GitHub Actions OIDC:

- **No private keys** to manage or rotate
- **Identity-bound** signatures via GitHub Actions workflow identity
- **Transparency log** recording in Rekor (immutable audit trail)
- **Automatic certificate** rotation via Fulcio CA

### SLSA Provenance

All builds generate SLSA v1 provenance containing:

- Build type and builder identity
- Source repository and commit hash
- Build invocation details (run ID, timestamp)
- Material dependencies

### Verification Before Deployment

The deployment pipeline MUST verify signatures before deploying:

```bash
# Verify release archive
cosign verify-blob \
  --certificate <archive>.cert \
  --signature <archive>.sig \
  --certificate-identity-regexp 'https://github.com/intelliflow-ai/intelliflow-crm/.*' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  <archive>

# Verify container image
cosign verify \
  --certificate-identity-regexp 'https://github.com/intelliflow-ai/intelliflow-crm/.*' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  ghcr.io/intelliflow-ai/intelliflow-crm:v1.0.0
```

### Full Documentation

For complete signing procedures, key management, and troubleshooting, see:
[Artifact Signing and Provenance](./signing.md)

---

## Update Review Requirements

### Dependency Update Process

1. **Create feature branch** for dependency updates
2. **Run update command**:
   ```bash
   pnpm update <package-name>
   ```
3. **Review changes** to `pnpm-lock.yaml`
4. **Run full test suite**:
   ```bash
   pnpm test
   pnpm run typecheck
   pnpm audit
   ```
5. **Submit PR** for review
6. **Security team review** (if lockfile changed)

### PR Requirements for Dependency Changes

When `pnpm-lock.yaml` is modified, the PR:

- MUST include justification for the update
- MUST pass all CI checks including SBOM generation
- MUST be reviewed by at least one security-aware team member
- SHOULD include changelog review for updated packages

### Review Checklist

For all dependency updates:

- [ ] New dependencies are from trusted publishers
- [ ] Version updates are intentional and justified
- [ ] No unexpected packages added (supply chain attack check)
- [ ] License compliance verified (no GPL/AGPL packages)
- [ ] Vulnerability scan passes (`pnpm audit`)
- [ ] No deprecated packages introduced
- [ ] Test suite passes

### Update Frequency

Per `security-baseline.json`:

| Update Type | Frequency | Urgency |
|-------------|-----------|---------|
| Security patches | Immediate | Critical |
| Major versions | Monthly review | Normal |
| Minor versions | Bi-weekly | Normal |
| Patch versions | Weekly | Normal |

---

## Vulnerability Response

### Response SLAs

Per `security-baseline.json`:

| Severity | Initial Response | Patch Deployment |
|----------|-----------------|------------------|
| Critical (CVSS 9.0+) | Immediate | 1-7 days |
| High (CVSS 7.0-8.9) | 24 hours | 7-14 days |
| Medium (CVSS 4.0-6.9) | 3 days | 14-30 days |
| Low (CVSS 0.1-3.9) | 7 days | 30-90 days |

### Vulnerability Thresholds

The CI pipeline enforces the following thresholds:

```json
{
  "maxAllowedVulnerabilities": {
    "critical": 0,
    "high": 5,
    "medium": 20,
    "low": 50
  }
}
```

- **Critical**: Build FAILS if any critical vulnerabilities exist
- **High**: Warning generated; manual review required if threshold exceeded
- **Medium/Low**: Tracked and addressed per SLA

### Remediation Process

1. **Detection**: Vulnerability detected via automated scanning
2. **Triage**: Security team assesses severity and impact
3. **Remediation**: Apply fix (update, patch, or workaround)
4. **Verification**: Confirm fix via re-scan
5. **Documentation**: Update security changelog

---

## License Compliance

### Allowed Licenses

The following licenses are approved for use:

| License | Status | Notes |
|---------|--------|-------|
| MIT | Approved | Preferred for OSS |
| Apache-2.0 | Approved | |
| BSD-2-Clause | Approved | |
| BSD-3-Clause | Approved | |
| ISC | Approved | |
| 0BSD | Approved | |

### Forbidden Licenses

The following licenses are **NOT ALLOWED**:

| License | Status | Reason |
|---------|--------|--------|
| GPL-2.0 | Forbidden | Copyleft requirements |
| GPL-3.0 | Forbidden | Copyleft requirements |
| AGPL-1.0 | Forbidden | Network copyleft |
| AGPL-3.0 | Forbidden | Network copyleft |

### License Check Process

The `security-sbom.yml` workflow automatically:

1. Extracts license information for all dependencies
2. Compares against allowed/forbidden lists
3. Generates warnings for forbidden licenses
4. Stores license report as artifact

### Exemption Process

If a forbidden-license package is required:

1. Document justification in `docs/security/license-exemptions.md`
2. Get approval from Legal and Security teams
3. Add to `security-baseline.json` exemptions
4. Review exemption quarterly

---

## Audit Trail

### What is Logged

| Event | Log Location | Retention |
|-------|-------------|-----------|
| Dependency updates | Git history | Permanent |
| SBOM generation | GitHub Actions | 90 days |
| Vulnerability scans | GitHub Actions + Security tab | 90 days |
| License checks | GitHub Actions | 30 days |
| Lockfile changes | Git history | Permanent |

### Monitoring

- **GitHub Security Tab**: Dependabot alerts, CodeQL findings
- **CI/CD Artifacts**: SBOM, audit reports, license reports
- **Git History**: All dependency changes tracked

### Compliance Reporting

For compliance audits, the following can be provided:

1. Complete SBOM for any release
2. Vulnerability history and remediation timeline
3. License compliance reports
4. Dependency update changelog
5. Signed artifact provenance attestations
6. Rekor transparency log entries

---

## References

- [Artifact Signing and Provenance](./signing.md)
- [OWASP Checklist - A06 Vulnerable Components](./owasp-checklist.md)
- [Security Baseline Configuration](../../artifacts/misc/security-baseline.json)
- [Zero Trust Design](./zero-trust-design.md)
- [SBOM Workflow](../../.github/workflows/security-sbom.yml)
- [Signing Workflow](../../.github/workflows/signing.yml)
- [NIST SP 800-161 (Supply Chain Risk Management)](https://csrc.nist.gov/publications/detail/sp/800-161/rev-1/final)
- [CycloneDX Specification](https://cyclonedx.org/specification/overview/)
- [SPDX Specification](https://spdx.dev/specifications/)
- [Sigstore Documentation](https://docs.sigstore.dev/)
- [SLSA Framework](https://slsa.dev/)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-27 | IFC-132 | Initial supply chain security policy |
| 1.1 | 2025-12-28 | IFC-133 | Added artifact signing section and references |

---

**Next Review**: 2026-03-28 (Quarterly)
**Owner**: Security Team
**Approver**: CTO
