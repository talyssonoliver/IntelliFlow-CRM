# Security (Sprint 0)

This folder captures Sprint 0 security deliverables for IntelliFlow CRM.

## What exists in Sprint 0

- CI security workflows and baseline thresholds (see `.github/workflows/security.yml`).
- Repository-level security policy (`SECURITY.md`).
- Configuration stubs and artifact tracking for:
  - scan results (`artifacts/misc/security-scan-results.json`)
  - compliance report placeholder (`artifacts/reports/compliance-report.pdf`)
  - applied patch log (`artifacts/logs/patch-log.csv`)

## What is intentionally deferred

Sprint 0 focuses on establishing security guardrails and repeatable checks.
Advanced items (full compliance evidence packs, automated remediation, SOC2/GDPR
audits) are tracked in `artifacts/debt-ledger.*` and are expected to land in
later sprints.

## Operator notes (manual verification)

- Review `.github/workflows/security.yml` for enabled scanners and thresholds.
- Ensure secret scanning is enabled at the Git hosting layer (GitHub Advanced
  Security) and that team access is configured appropriately.
- Replace placeholder artifacts with real scan outputs once CI is running.

