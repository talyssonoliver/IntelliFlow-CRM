# Artifact Signing and Provenance

**Status**: Implemented (Sprint 7)
**Related Task**: IFC-133
**Owner**: Security Team
**Last Updated**: 2025-12-28
**Review Frequency**: Quarterly
**Dependencies**: IFC-132 (SBOM Generation)

## Overview

This document defines IntelliFlow CRM's artifact signing and provenance policy,
ensuring all production-bound artifacts are cryptographically signed and include
verifiable provenance attestations. This implements SLSA (Supply-chain Levels
for Software Artifacts) Level 2+ compliance.

## Table of Contents

1. [Signing Process](#signing-process)
2. [Key Management](#key-management)
3. [Provenance Generation](#provenance-generation)
4. [Verification Procedures](#verification-procedures)
5. [Integration with CI/CD](#integration-with-cicd)
6. [Compliance and Audit](#compliance-and-audit)

---

## Signing Process

### Overview

All production-bound build artifacts are signed using Sigstore's cosign tool,
which provides keyless signing using OIDC identity tokens from GitHub Actions.

### What Gets Signed

| Artifact Type | Signing Tool | Format | Storage |
|---------------|--------------|--------|---------|
| Container Images | cosign | OCI signatures | GitHub Container Registry |
| Release Archives | cosign | Detached signatures (.sig) | GitHub Releases |
| SBOM Files | cosign | Attached attestations | GitHub Artifacts |
| NPM Packages | npm provenance | SLSA attestation | npm Registry |

### Signing Workflow

The signing process is automated in `.github/workflows/signing.yml`:

```
Build Artifact
      |
      v
Generate Provenance (SLSA predicate)
      |
      v
Sign with Cosign (keyless, OIDC)
      |
      v
Attach Attestation to Artifact
      |
      v
Upload to Registry/Storage
      |
      v
Verification Check (pre-deployment)
```

### Signature Format

Signatures are generated in Sigstore's standard format:

```json
{
  "payloadType": "application/vnd.in-toto+json",
  "payload": "<base64-encoded SLSA provenance>",
  "signatures": [
    {
      "keyid": "",
      "sig": "<base64-encoded signature>"
    }
  ]
}
```

### Keyless Signing

We use Sigstore's keyless signing with GitHub Actions OIDC:

1. **Identity**: GitHub Actions workflow identity (repository, workflow, actor)
2. **Certificate**: Short-lived certificate from Fulcio CA
3. **Transparency**: All signatures recorded in Rekor transparency log
4. **No Key Management**: No private keys to manage or rotate

**Benefits**:
- No secret key management overhead
- Immutable audit trail via transparency log
- Tied to CI/CD identity (non-repudiation)
- Automatic certificate rotation

---

## Key Management

### Keyless Mode (Primary)

In keyless mode, no long-lived keys are used. Instead:

| Component | Source | Lifetime |
|-----------|--------|----------|
| Signing Key | Ephemeral from Fulcio | ~10 minutes |
| OIDC Token | GitHub Actions | ~5 minutes |
| Certificate | Fulcio CA | ~10 minutes |
| Signature Record | Rekor | Permanent |

### Fallback Key Mode (Disaster Recovery)

For scenarios where keyless signing is unavailable:

| Key Type | Storage | Rotation | Access |
|----------|---------|----------|--------|
| Cosign Private Key | GitHub Secrets | 90 days | GitHub Actions only |
| Cosign Public Key | Repository (public) | 90 days | Public |
| Backup Key | HashiCorp Vault | 180 days | Security Team |

### Key Rotation Procedure

If using stored keys (fallback mode):

1. **Generate new key pair**:
   ```bash
   cosign generate-key-pair
   ```

2. **Store private key**:
   - Update GitHub Secret `COSIGN_PRIVATE_KEY`
   - Update Vault backup at `secret/intelliflow/cosign/private-key`

3. **Publish public key**:
   - Update `infra/security/cosign.pub` in repository
   - Announce key rotation to consumers

4. **Sign with both keys** (transition period):
   - Sign with old key for backward compatibility
   - Sign with new key as primary
   - Transition period: 30 days

5. **Retire old key**:
   - Remove old key from GitHub Secrets
   - Archive old key in Vault (read-only)

### Emergency Key Revocation

If a key is compromised:

1. **Immediately** revoke GitHub Secret containing private key
2. **Announce** revocation to all consumers
3. **Generate** new key pair
4. **Re-sign** all affected artifacts with new key
5. **Update** documentation with new public key
6. **Audit** all signatures made with compromised key

---

## Provenance Generation

### SLSA Provenance

All builds generate SLSA provenance attestations containing:

```json
{
  "_type": "https://in-toto.io/Statement/v0.1",
  "predicateType": "https://slsa.dev/provenance/v1",
  "subject": [
    {
      "name": "intelliflow-crm",
      "digest": {
        "sha256": "<artifact-hash>"
      }
    }
  ],
  "predicate": {
    "buildType": "https://github.com/slsa-framework/slsa-github-generator/generic@v1",
    "builder": {
      "id": "https://github.com/intelliflow-ai/intelliflow-crm/.github/workflows/signing.yml@refs/heads/main"
    },
    "invocation": {
      "configSource": {
        "uri": "git+https://github.com/intelliflow-ai/intelliflow-crm@refs/heads/main",
        "digest": {
          "sha1": "<commit-sha>"
        },
        "entryPoint": ".github/workflows/signing.yml"
      }
    },
    "metadata": {
      "buildInvocationId": "<github-run-id>",
      "buildStartedOn": "<timestamp>",
      "buildFinishedOn": "<timestamp>"
    },
    "materials": [
      {
        "uri": "git+https://github.com/intelliflow-ai/intelliflow-crm",
        "digest": {
          "sha1": "<commit-sha>"
        }
      }
    ]
  }
}
```

### Provenance Fields

| Field | Description | Verification Use |
|-------|-------------|------------------|
| `subject.digest` | Artifact hash | Verify artifact integrity |
| `builder.id` | Workflow identity | Verify build origin |
| `invocation.configSource` | Source repo + commit | Verify source code |
| `metadata.buildInvocationId` | GitHub run ID | Audit trail |
| `materials` | Build inputs | Dependency verification |

### Attestation Storage

| Attestation Type | Storage Location | Retention |
|------------------|------------------|-----------|
| SLSA Provenance | GitHub Artifacts | 90 days |
| Container Attestation | OCI Registry | With image |
| Release Attestation | GitHub Release | Permanent |
| SBOM Attestation | GitHub Artifacts | 90 days |

---

## Verification Procedures

### Pre-Deployment Verification

Before deploying any artifact, the deployment pipeline MUST verify:

1. **Signature Validity**:
   ```bash
   cosign verify-blob \
     --certificate-identity-regexp 'https://github.com/intelliflow-ai/intelliflow-crm/.*' \
     --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
     <artifact>
   ```

2. **Provenance Check**:
   ```bash
   cosign verify-attestation \
     --type slsaprovenance \
     --certificate-identity-regexp 'https://github.com/intelliflow-ai/intelliflow-crm/.*' \
     --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
     <artifact>
   ```

3. **Hash Verification**:
   ```bash
   sha256sum -c <artifact>.sha256
   ```

### Container Image Verification

For Docker images:

```bash
# Verify signature
cosign verify \
  --certificate-identity-regexp 'https://github.com/intelliflow-ai/intelliflow-crm/.*' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  ghcr.io/intelliflow-ai/intelliflow-crm:v1.0.0

# Verify SBOM attestation
cosign verify-attestation \
  --type cyclonedx \
  --certificate-identity-regexp 'https://github.com/intelliflow-ai/intelliflow-crm/.*' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  ghcr.io/intelliflow-ai/intelliflow-crm:v1.0.0
```

### Release Archive Verification

For tar.gz releases:

```bash
# Download signature
curl -L https://github.com/intelliflow-ai/intelliflow-crm/releases/download/v1.0.0/intelliflow-crm-1.0.0.tar.gz.sig -o release.tar.gz.sig

# Verify signature
cosign verify-blob \
  --bundle release.tar.gz.sig \
  --certificate-identity-regexp 'https://github.com/intelliflow-ai/intelliflow-crm/.*' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  release.tar.gz
```

### Verification in Deployment Pipeline

The blue-green deployment workflow includes verification:

```yaml
- name: Verify artifact signatures
  run: |
    cosign verify \
      --certificate-identity-regexp 'https://github.com/intelliflow-ai/intelliflow-crm/.*' \
      --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
      ${{ env.CONTAINER_IMAGE }}

    if [ $? -ne 0 ]; then
      echo "ERROR: Signature verification failed!"
      exit 1
    fi
```

### Verification Failures

If verification fails:

1. **DO NOT deploy** the artifact
2. **Alert** security team immediately
3. **Investigate** the source of the unsigned/invalid artifact
4. **Audit** recent build logs for anomalies
5. **Rebuild** artifact from verified source if needed

---

## Integration with CI/CD

### Workflow Integration

The signing workflow integrates with existing CI/CD:

```
CI Pipeline (ci.yml)
      |
      v
SBOM Generation (security-sbom.yml)
      |
      v
Artifact Signing (signing.yml)  <-- This workflow
      |
      v
Blue/Green Deploy (blue-green-deploy.yml)
      |
      +-- Verification step before switch
```

### Trigger Conditions

The signing workflow triggers on:

- **Releases**: All release tags (v*)
- **Main Branch**: All pushes to main
- **Manual**: workflow_dispatch for testing

### Artifact Flow

| Stage | Artifact | Signature |
|-------|----------|-----------|
| Build | dist/, .next/ | Not signed |
| Package | .tar.gz, Docker image | Signed |
| SBOM | .cyclonedx.json | Attested |
| Release | GitHub Release assets | Signed + Provenance |
| Deploy | Container image | Verified before deploy |

### CI/CD Secrets Required

| Secret | Purpose | Source |
|--------|---------|--------|
| `GITHUB_TOKEN` | OIDC token for keyless signing | GitHub (automatic) |
| `COSIGN_PRIVATE_KEY` | Fallback signing key | GitHub Secrets |
| `COSIGN_PASSWORD` | Key password (if encrypted) | GitHub Secrets |

---

## Compliance and Audit

### SLSA Compliance

This implementation achieves:

| SLSA Level | Requirement | Status |
|------------|-------------|--------|
| Level 1 | Build process documented | Achieved |
| Level 2 | Signed provenance | Achieved |
| Level 2 | Hosted build platform | Achieved (GitHub Actions) |
| Level 3 | Hardened build platform | Partial (GitHub-managed) |

### Audit Trail

All signing activities are logged:

| Log Type | Location | Retention |
|----------|----------|-----------|
| Rekor Transparency Log | rekor.sigstore.dev | Permanent (public) |
| GitHub Actions Logs | GitHub UI | 90 days |
| Signing Workflow Output | GitHub Step Summary | 90 days |
| Verification Results | Deployment logs | 90 days |

### Querying Rekor

To query the transparency log for signatures:

```bash
# Search by artifact hash
rekor-cli search --sha "sha256:<artifact-hash>"

# Get entry details
rekor-cli get --uuid <entry-uuid>

# Verify inclusion
rekor-cli verify --artifact <artifact> --signature <signature>
```

### Compliance Reporting

For audits, the following can be provided:

1. **Signature verification report** for any release
2. **Provenance attestation** for any artifact
3. **Rekor inclusion proof** for any signature
4. **SBOM with attestation** for any build

---

## Troubleshooting

### Common Issues

#### Signing Fails with OIDC Error

**Symptom**: `Error: OIDC token request failed`

**Cause**: GitHub Actions OIDC permissions not configured

**Solution**: Ensure workflow has `id-token: write` permission:

```yaml
permissions:
  id-token: write
  contents: read
```

#### Verification Fails with Certificate Error

**Symptom**: `Error: certificate identity mismatch`

**Cause**: Certificate identity pattern doesn't match

**Solution**: Check the certificate identity regexp matches your repository:

```bash
# Correct pattern
--certificate-identity-regexp 'https://github.com/YOUR-ORG/YOUR-REPO/.*'
```

#### Rekor Entry Not Found

**Symptom**: `Error: entry not found in log`

**Cause**: Network issue or recent signing (propagation delay)

**Solution**: Wait 30 seconds and retry, or check Rekor status

---

## References

- [Supply Chain Policy](./supply-chain.md)
- [SBOM Generation Workflow](../../.github/workflows/security-sbom.yml)
- [Signing Workflow](../../.github/workflows/signing.yml)
- [OWASP Checklist - A08 Software Integrity](./owasp-checklist.md)
- [Zero Trust Design](./zero-trust-design.md)
- [Sigstore Documentation](https://docs.sigstore.dev/)
- [SLSA Specification](https://slsa.dev/spec/v1.0/)
- [Cosign Usage](https://docs.sigstore.dev/cosign/overview/)
- [Rekor Transparency Log](https://docs.sigstore.dev/rekor/overview/)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-28 | IFC-133 | Initial artifact signing and provenance policy |

---

**Next Review**: 2026-03-28 (Quarterly)
**Owner**: Security Team
**Approver**: CTO
