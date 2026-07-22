# ENG-OPS-002 — Remediation Execution Plan

**Source:** `artifacts/reports/sprint-19/baseline/remediation-candidates.json`
(consolidated from the 7 findings files). **Date:** 2026-07-22. **Baseline
commit:** `origin/main @ f57490a91`.

> Remediation tasks ship as **separate PRs**, never mixed with the ENG-OPS-002
> audit (PR #599). Each task ID `ENG-OPS-002.R##` is registered in
> `Sprint_plan.csv`. Autonomy is assessed per task: **[AUTO]** = shipped
> autonomously; **[REVIEW]** = design decision or large refactor, held for human
> sign-off.

## Summary

- **Total findings:** 101 — **8 Critical, 21 High, 39 Medium, 25 Low, 8 Info**.
- **Critical+High remediation candidates:** 29.
- **By category (C+H):** DDD 4, hexagonal 6, security 1, performance 1,
  quality 8, docs/governance 9.
- **By owner (C+H):** backend-architect 8, devops-lead 8, domain-expert 6,
  security-lead 4, data-engineer 2, stoa-automation 1.

## Wave 1 — P0 / Critical (ship immediately)

| Task | Title | Findings | Files | Owner | Est | Autonomy | Deps |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **R01** | Tenant-isolation fix in email `searchContacts` | SEC-001 | `apps/api/src/modules/email/inbound.router.ts:1201` | security-lead | 45m | **[AUTO]** | — |
| **R02** | Dedup evaluator correctness bugs | QUAL-003, QUAL-004 | `packages/…/duplicate-rule-evaluator.ts`, `tests/property/unit/crm/dedup-evaluator.prop.test.ts` | domain-expert | 120m | **[AUTO]** | — |
| **R03** | Stale-doc cleanup (root anchor + sprint-18 summary) | STALE-001, STALE-002 | `CLAUDE.md:3`, `.specify/sprints/sprint-18/_summary.json` | devops-lead | 75m | **[AUTO]** | — |
| **R04** | Lead→Deal conversion transaction atomicity | DDD-001 | `packages/application/src/usecases/leads/ConvertLeadToDealUseCase.ts`, Prisma\*Repository | backend-architect | 480m | **[REVIEW]** — needs unit-of-work/TransactionClient design across 4 repos | — |
| **R05** | Wire ticket port into composition root (or delete orphan) | HEX-001 | `apps/api/src/container.ts:564`, `TicketService.ts` | backend-architect | 240m | **[REVIEW]** — design decision (wire vs delete) | — |
| **R06** | Appointments router → use-case migration | HEX-005 | `apps/api/src/modules/legal/appointments.router.ts` (~28 sites) | backend-architect | 600m | **[REVIEW]** — 20+ file architectural refactor | HEX-011 |
| **R07** | Consolidate duplicated prompt-sanitizer | QUAL-015 | `apps/api/src/shared/prompt-sanitizer.ts`, `packages/adapters/src/shared/prompt-sanitizer.ts` | security-lead | 240m | **[REVIEW]** — canonical-regex design decision (the two copies diverge) | — |

**Wave 1 autonomous set:** R01, R02, R03 (localized, clear fixes, low blast
radius). **Held for review:** R04, R05, R06, R07 (each is a design decision or a
20+ file refactor — per the task's STOP rules).

## Wave 2 — High (ship next)

| Task | Title | Findings | Owner | Est | Sprint |
| --- | --- | --- | --- | --- | --- |
| **R08** | Ticket hexagonal extraction (service→use-case behind port) | HEX-002, HEX-003 | backend-architect | 540m | 20 |
| **R09** | Lead-routing hexagonal fix (depend on `LeadRepositoryPort`) | HEX-004 | backend-architect | 180m | 20 |
| **R10** | Domain state-machine guard bugs (ticket + task aggregates) | QUAL-001, QUAL-002 | domain-expert | 360m | 19 |
| **R11** | Domain-event atomicity / outbox in transaction | DDD-002 | backend-architect | 360m | 19 (deps R04) |
| **R12** | Lead domain policy + `TenantId` value object | DDD-003, DDD-004 | domain-expert | 840m | 20 |
| **R13** | Flaky-test lint gate + reconcile the 21 skips | QUAL-012 | devops-lead | 90m | 19 |
| **R14** | `pg_trgm` search indexes (kill ILIKE seq-scans) | PERF-003 | data-engineer | 480m | 20 |
| **R15** | Schema-validation triage (175/447) + wire gate | GOV-A-003 | stoa-automation | 600m | 19 |
| **R16** | Attestation + provenance backfill (18 missing + 177 gap) | GOV-A-001, GOV-A-002 | devops-lead | 720m | 19 |
| **R17** | ERP/SAP disabled test-suite decision | QUAL-013 | backend-architect | 60m | backlog |

## Wave 3 — Medium (Sprint-19 backlog triage)

| Task | Title | Scope | Owner |
| --- | --- | --- | --- |
| **R18** | Medium-severity findings batch | 39 Medium findings across ddd/hexagonal/security/perf/quality/stale — triage and bucket into focused follow-ups | multiple |

Medium highlights to fold in: PERF-001 (new N+1 `inbound.router.ts:946`) +
GOV-A-005 (wire `nplus1:scan`/`validate:schemas` into pre-ship); GOV-A-004
(flip DOC-015/016 to Completed); GOV-A-006 (Sonar overall-rating gate); SEC-003
(`adminProcedure` on webhook admin), SEC-004 (inbound-webhook signature); the
`leads/[id]/page.tsx` 2,908-line god-file split.

## Sequencing & merge discipline

1. This plan PR registers **R01–R18** in `Sprint_plan.csv` (all `Backlog`).
2. Wave 1 autonomous PRs (R01→R02→R03) ship **sequentially**, each rebased on
   latest `main`, each flipping only its own task to `Completed` — avoids
   Sprint_plan.csv merge conflicts.
3. R04–R07 (Critical, REVIEW) and all Wave 2/3 are handed back for human
   prioritization; none are auto-shipped.

## Autonomy rationale (STOP conditions honored)

Per the task's stop rules — *"fix grande demais (20+ arquivos) → STOP; needs
design decision → STOP"* — the four held Criticals each trip a rule: R04
(transaction/unit-of-work redesign), R05 (wire-vs-delete design choice), R06
(28-site refactor), R07 (which sanitizer regex is canonical is a security design
call). Shipping them blind would risk correctness/security regressions the audit
exists to prevent.
