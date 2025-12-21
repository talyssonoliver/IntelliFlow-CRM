# Security (Sprint 0)

This folder captures Sprint 0 security deliverables for IntelliFlow CRM.

## What exists in Sprint 0

- CI security workflows and baseline thresholds (see
  `.github/workflows/security.yml`).
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

## Sprint 1: Zero Trust Design (IFC-072 - PARTIAL)

**Status:** Design Complete - Implementation in Sprint 2-3

### Documents Created

1. **rls-design.md** - Row Level Security Design
   - RLS policy patterns for all core tables
   - Helper functions for JWT claim extraction
   - Owner-based isolation with hierarchical access
   - Performance considerations and testing strategy

2. **multi-tenant-isolation.md** - Multi-Tenant Isolation Strategy
   - Current: User-level tenancy (owner-based)
   - Future: Organization-level tenancy
   - Attack vector mitigations

3. **ADR-009: Zero Trust Security** - Architecture Decision
   - Decision to use RLS + application authorization
   - Defense in depth approach (3 layers)

### Migration Files Created

Located in `infra/supabase/migrations/`:

1. **20250122000000_enable_rls.sql** - Enable RLS
2. **20250123000000_rls_helper_functions.sql** - Helper functions
3. **20250124000000_rls_policies.sql** - Complete policies

**RLS Coverage:** 100% of core tables ✓
