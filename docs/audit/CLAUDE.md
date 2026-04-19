# docs/audit — Agent guide

## Purpose

**Stale** engineering code-wiring audits from sprints 3–11. These reviewed how
UI detail pages (Lead 360, Contact 360, Account 360, Deal, Task, Dashboard)
connected to their backend tRPC procedures. Findings were acted on at the time;
the audits themselves have NOT been maintained since.

## Status: STALE

All 11 files are point-in-time snapshots. Do NOT treat them as current-state
documentation. If you need to understand the CURRENT wiring state of a page,
read the source code directly:

- Page: `apps/web/src/app/<entity>/[id]/page.tsx`
- Router: `apps/api/src/modules/<entity>/<entity>.router.ts`
- Tests: `apps/api/src/modules/<entity>/__tests__/`

## What does NOT belong here

- **Compliance/regulatory audits** → `docs/compliance-and-governance/`
- **Security audits** → `docs/security/` (e.g. `security-claims-audit.md` lives
  there now)
- **Operational audits** → `docs/operations/` (e.g. `system-audit.md`)
- **Architecture decisions** → `docs/architecture/adr/`

## Consolidation context (2026-04-17)

- `docs/audit/security-claims-audit.md` moved to
  `docs/security/security-claims-audit.md` (it was a security ops audit, not an
  engineering wiring review).
- The remaining 11 files stay here with "stale" status — they have 512
  cross-repo references (mostly from sprint plans/specs that depended on audit
  findings at execution time). Moving them would be high-churn for zero
  current-value gain.
