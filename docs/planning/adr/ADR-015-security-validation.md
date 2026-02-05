# ADR-015: Security Validation and Remediation Strategy

**Status:** Accepted  
**Date:** 2026-02-02  
**Deciders:** Security Eng, QA Lead, Tech Lead (STOA-Security)  
**Related Tasks:** ENV-013-AI, IFC-046, IFC-040  

## Context and Problem
- Security automation (ENV-013-AI) was delivered before a unified validation/remediation playbook existed.
- Upcoming and backlog items (IFC-046 security tests, IFC-040 production hardening) need a consistent gate to avoid drift between scans, CI checks, and prod controls.
- Regulatory posture (zero trust, SBOM, RLS) must remain provable in audits without re-opening completed work.

## Decision
Implement a single security-validation workflow and artifact contract covering build, pre-prod, and prod:
1) **Static + Dependency Scans**: OWASP ZAP baseline + Snyk (or equivalent) on every release candidate; fail on High/Critical; Medium allowed only with documented waiver and deadline.
2) **Infrastructure/Runtime Checks**: CI job enforces image signing, SBOM generation, and container scanning; production hardening requires RLS enforcement, vault-backed secrets, and WAF/TLS at edge.
3) **Remediation SLA**: High ≤ 7 days, Medium ≤ 30 days; tracked in `artifacts/reports/security-scan-final.pdf` (or successor).
4) **Evidence Paths**: All security validation outputs land under `.specify/.../attestations/<TASK_ID>/security/` plus summary attached to `artifacts/reports/security-scan-final.pdf`.

## Considered Options
- Per-task bespoke checks (rejected: inconsistent, high audit overhead).
- One-time pen-test only (rejected: stale quickly).
- Unified, repeatable pipeline with codified gates (chosen).

## Consequences
**Positive:** Repeatable gating, clearer waivers, audit-friendly evidence, reduced false completion.  
**Negative:** Stricter gates may block releases; requires maintaining scan configs.  

## Implementation Notes
- CI: extend `pnpm audit`/`pnpm test` stage with `pnpm --filter apps/api lint:security` or equivalent and ZAP/Snyk jobs.
- Artifacts to produce per run: `security-scan-results.json`, `snyk-report.json`, `zap-report.xml`, SBOM, and WAF/vault config hashes.
- Production hardening (IFC-040): must show image signing, RLS policies, vault, WAF/TLS, and blue-green metrics.

## Verification
- MATOP Security STOA must read these artifacts and enforce fail/warn thresholds.
- Completion gates in `/exec` must include hash verification for the above security artifacts.

## Links
- Supersedes ad-hoc security notes in ENV-013-AI; aligns with ADR-009 Zero Trust and ADR-008 Audit Logging.
