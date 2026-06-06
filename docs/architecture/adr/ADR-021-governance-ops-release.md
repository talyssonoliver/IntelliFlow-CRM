# ADR-021: Governance, Operations, and Release Quality Gates

**Status:** Accepted  
**Date:** 2026-02-02  
**Deciders:** CTO, DevOps Lead, QA Lead  
**Related Tasks:** IFC-130, IFC-132, IFC-133, IFC-134, IFC-142, IFC-160

## Context and Problem

- Release governance, supply-chain security, SBOM/signing, and incident/SLO
  processes were scattered across tasks without a unified policy.

## Decision

1. **Release Promotion:** Staging auto-deploy; promotion requires green
   typecheck/test/lint/build + security scan + SBOM + provenance.
2. **Supply Chain:** Dependency pinning, SBOM per build, image signing +
   attestation (provenance) mandatory; fail on critical vulns.
3. **SLO/Incident:** Define SLIs/SLOs; on-call + restore drills; incident
   runbooks must be present before go-live.
4. **Paths:** Artifacts recorded under
   `.specify/.../attestations/<TASK_ID>/release/` plus central report
   `artifacts/reports/security-scan-final.pdf`.
5. **Infrastructure changes (added 2026-06-05, see ADR-064):** any change under
   `infra/terraform/**` requires a **`terraform plan`** posted on the PR and
   reviewed/approved as a merge gate. Infrastructure is changed via Terraform
   PR, never by out-of-band console/dashboard edits. This makes drift a
   reviewable diff rather than an invisible surprise.

## Considered Options

- Team-by-team rules (rejected: inconsistent).
- Single promotion gate with standard artifacts (chosen).

## Consequences

Positive: Auditable, consistent releases; lower risk. Negative: More CI
steps/time.

## Implementation Notes

- GH Actions: add SBOM + signing + provenance steps; block on critical CVEs.
- Runbooks stored in docs/operations; promotion policy in
  docs/release/promotion-policy.md.

## Verification

- MATOP Automation + Security STOAs verify SBOM, signing, scans, and runbooks
  present; promotion blocked on failures.

## Links

- ADR-008, ADR-009, ADR-015.
