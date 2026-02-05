# PRD: Release Governance, Supply Chain, and SLO/Incident Management

**Version:** 1.0  
**Date:** 2026-02-02  
**Owners:** CTO, DevOps Lead  
**Related Tasks:** IFC-130, IFC-132, IFC-133, IFC-134, IFC-142, IFC-160  
**Decision Records:** ADR-021-governance-ops-release.md

## Summary
Define release promotion, supply-chain controls, SLOs, and incident processes to ensure safe, auditable releases.

## Goals
- Promotion gate requiring tests/typecheck/lint/build + SBOM + signing + vulnerability scan.
- SLOs/SLIs defined with on-call and restore drills.
- Provenance and attestation for builds/images.

## Non-Goals
- Feature-level UX specs.
- Vendor-specific deployment guides.

## Users & Use Cases
- DevOps: promote builds with proof of security and quality gates.
- SRE/On-call: manage incidents, track SLO compliance.

## Functional Requirements
- CI generates SBOM, runs scans, produces provenance/signing artifacts.
- Promotion policy enforced; waivers tracked.
- Incident runbooks and SLO dashboards required before go-live.

## Non-Functional Requirements
- Security: fail on critical CVEs; signed artifacts.
- Reliability: incident response time targets; restore drills scheduled.

## Metrics
- Promotion pass rate; time-to-restore; SLO compliance; number of unsigned artifacts (target 0).

## Acceptance Criteria
- SBOM + signing + scan reports attached to attestation.
- SLOs documented; incident/on-call runbooks present.

## Dependencies
- ADR-008, ADR-009, ADR-015, ADR-021.

## Risks / Mitigations
- Risk: Longer CI times → Mitigate with caching and parallel scans.
- Risk: Non-compliance → Mitigate with mandatory promotion gate.
