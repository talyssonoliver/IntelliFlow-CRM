# ENG-OPS-002 Findings Validation — Critical/High

**Date:** 2026-07-22 · **Worktree:** `origin/main` @ `d12093fa2` (includes merged #601/#602/#603)
**Method:** 6 read-only category-specialist agents opened the real `file:line` for every Critical/High finding and judged REAL vs false-positive (auditor-lacked-context). A codex adversarial pass then tried to *refute* the two most FP-prone findings (SEC-002, HEX-005).
**Scope:** 24 Critical/High findings (6 Critical, 18 High). Medium/Low/Info not validated here.

## Headline

- **0 outright false positives.** Every Critical/High finding reproduces against the current code.
- **3 already remediated** by the merged PRs: SEC-001 (#602), QUAL-003 & QUAL-004 (#603) — fixes verified present.
- **2 severity corrections** from the adversarial pass: SEC-002 (High→**Medium**, app-layer mitigations), HEX-005 (Critical→**Medium**, direct-read is a sanctioned convention; only the mixed-persistence sub-issue stands).
- **19 CONFIRMED-open** requiring remediation.

## Verdict table

| finding-id | sev (validated) | category | verdict | rationale (real code checked) |
|---|---|---|---|---|
| SEC-004 | High | unauthenticated-webhook-spoofing | **CONFIRMED** | `inbound.router.ts:216` `webhook: publicProcedure` (no auth), no HMAC/signature check before `resolveTenantForInboundEmail` resolves tenant by caller-supplied `to` domain → spoof inbound email into any tenant. Untouched by #601-603. |
| SEC-003 | High | broken-access-control-rbac | **CONFIRMED** | `webhooks.router.ts:116/146` `registerSource`/`unregisterSource` use `protectedProcedure` (no role check) despite "admin only" doc; existing `adminProcedure` (`trpc.ts:256`, `isAdmin` guard) is not used. Any authed non-admin can register webhook sources. |
| DDD-001 | Critical | cross-aggregate-transaction | **CONFIRMED** | `ConvertLeadToDealUseCase.ts:97` docstring claims atomic persist but Account/Contact/Opportunity+Lead saves are in 3 separate try/catch blocks, zero `$transaction`. Same non-atomic split duplicated in `LeadService.convertLead()`. |
| HEX-001 | Critical | incomplete-composition-root | **CONFIRMED** | `container.ts:564` `new TicketService(prismaClient)` — raw Prisma, no port. A full `TicketRepositoryPort` + Prisma/InMemory adapters exist with tests but `grep` finds zero usages in `apps/` → dead port+adapter pair. |
| SEC-002 | **Medium** (was High) | rls-owner-bypass | **CONFIRMED (mitigated)** | 69 `ENABLE` RLS / 0 `FORCE` across migrations; single `DATABASE_URL` role, and migration `20260607000002…:3-4` documents the CRM "connects via a privileged role that bypasses RLS". **But** app-layer defense-in-depth (`tenant-context.ts:163/325` sets `app.current_tenant_id` + always injects `tenantId`) means RLS is not the sole control → real DB-layer defect, severity reduced. |
| PERF-003 | High | missing-index | **CONFIRMED** | `global-search.router.ts` leading-wildcard `ILIKE '%X%'` on Lead/Contact/Account/Opportunity/Ticket; schema has only plain B-tree indexes; `pg_trgm` not enabled, no GIN/trigram index → sequential scans as tenants grow. |
| QUAL-015 | Critical | duplicated-code | **CONFIRMED** | Two `prompt-sanitizer.ts` copies (`apps/api/src/shared/:77` vs `packages/adapters/src/shared/:64`) with **drifted** regex (`[^\r\n]{0,200}` vs `[^\n]{0,200}`) and `sanitizeOutput` present in only one. Security-relevant divergence. |
| HEX-002 | High | layer-violation | **CONFIRMED** | `TicketService.ts:19` `constructor(private readonly prisma: PrismaClient)`, imports Prisma directly, lives in `apps/api/src/services/` not `packages/application/usecases/`. No port. |
| HEX-003 | High | layer-violation | **CONFIRMED** | `TicketRoutingService.ts:47` raw `PrismaClient` ctor, wired at `container.ts:567`; no routing repository port exists. |
| HEX-004 | High | layer-violation | **CONFIRMED** | `LeadRoutingService.ts:98` raw `PrismaClient`, wired at `container.ts:570` — while the *same* container wires `PrismaLeadRepository` for `LeadService` (inconsistent dual-path in one bounded context). |
| DDD-002 | High | event-outside-transaction | **CONFIRMED** | `CreateLeadUseCase.ts:69` `save()` completes before `eventBus.publishAll()` in a try/catch that only `console.error`s (never re-throws/retries). Same swallow pattern in `LeadService` + `ConvertLeadToDealUseCase`. Outbox atomicity gap open. |
| DDD-003 | High | missing-value-object | **CONFIRMED** | `Lead.ts:65` `tenantId: string` raw primitive while Email/PhoneNumber/LeadScore are VOs in the same file; no `TenantId` VO exists anywhere in `packages/domain`. |
| DDD-004 | High | invariant-outside-domain | **CONFIRMED** | `LeadService.ts:231` auto-qualify policy (`LEAD_SCORE_THRESHOLDS` 75/20) lives in the app service; `LeadScore.ts:47` tier getter uses *different* hard-coded boundaries (80/50) → two divergent score definitions. |
| QUAL-001 | High | skipped-test-hides-bug | **CONFIRMED** | `ticket-domain.prop.test.ts:285/351/437/455/475` all `it.skip`; verified `Ticket.changePriority/assign/unassign` have missing/wrong status guards (real bugs the skips hide). |
| QUAL-002 | High | skipped-test-hides-bug | **CONFIRMED** | `task-domain.prop.test.ts:271…` all `test.skip`; `Task.changeStatus` ignores `VALID_TASK_TRANSITIONS`, `assignTo*` have zero status guards. |
| QUAL-012 | High | stale-adr | **CONFIRMED** | `ADR-054:263` still claims a `no-skipped-tests` ESLint rule "already enforced in CI"; grep of `eslint.config.mjs` → zero matches. ADR still `Status: Proposed`. False enforcement claim. |
| QUAL-013 | High | disabled-test-suite | **CONFIRMED** | `erp.test.ts:24` `describe.skip('SAP ERP Adapter')` wraps all 19 cases (linked IFC-099). Documented reason exists but SAP adapter has zero executed coverage. |
| GOV-A-001 | High | missing-attestation | **CONFIRMED** | 18 sprint-18 attestation dirs have only `task-tracking.json`; `attestation.json` genuinely absent (the `.specify/.gitignore` whitelists it, so absence is a real gap, not ignore). |
| GOV-A-002 | High | provenance-gap | **CONFIRMED** | Recomputed from `task-reconciliation.csv` (408 rows): 177 Completed tasks lack full provenance (159 incomplete attestation + 18 none). Matches cited figures. |
| GOV-A-003 | High | schema-drift | **CONFIRMED** | `validate-schemas` log summary `Passed 272 / Failed 175 / Total 447`; body lists real Zod errors (bad sha256 patterns, wrong types) across attestations. |
| HEX-005 | **Medium** (was Critical) | layer-violation | **CONFIRMED (re-scoped)** | Adversarial refute: direct `ctx.prismaWithTenant` reads are a **sanctioned repo-wide convention** (account/contact/lead routers, endorsed at `trpc.ts:278`) — the "isolated Critical violation / 48 calls" framing is wrong (actual 39). Real residual: `appointments.router.ts` *mixes* container use-cases (`:487`) with direct DB writes (`:548/:729`) in one file, against `apps/api/CLAUDE.md`. Medium. |
| SEC-001 | Critical | idor-cross-tenant-leak | **CONFIRMED — already fixed (#602)** | `inbound.router.ts:1204` now scopes `searchContacts` by `tenantId` (comment cites SEC-001/R01). Fix verified present. No action. |
| QUAL-003 | Critical | skipped-test-hides-bug | **CONFIRMED — already fixed (#603)** | `dedup-evaluator.prop.test.ts:646` un-skipped + `// FIXED (R02/QUAL-003)`; `duplicate-rule-evaluator.ts:165` uses clamped threshold (threshold=0 → floor=0). No action. |
| QUAL-004 | High | skipped-test-hides-bug | **CONFIRMED — already fixed (#603)** | `dedup-evaluator.prop.test.ts:683` un-skipped + `// FIXED (R02/QUAL-004)`; `joinComposite()` returns `''` when all parts falsy. No action. |

## Distribution

| Verdict | Count | % |
|---|---|---|
| CONFIRMED (open, needs remediation) | 19 | 79% |
| CONFIRMED (already remediated) | 3 | 13% |
| CONFIRMED (severity-corrected: SEC-002, HEX-005) | 2 | 8% |
| REJECTED (false positive) | 0 | 0% |
| NEEDS-INFO | 0 | 0% |
| **Total** | **24** | 100% |

By category (CONFIRMED-open / total C+H): DDD 4/4 · Hexagonal 5/5 · Security 3/4 (1 fixed) · Quality 5/7 (2 fixed) · Performance 1/1 · Governance 3/3.

**On the false-positive concern:** it was low — every finding reproduced. The auditor's *weakness* showed up as **mis-severity from missing repo conventions** (HEX-005 over-rated; SEC-002 over-rated), not fabricated findings. Two findings' cited counts were slightly off (HEX-005 39≠48) but didn't change the substance.

## Top 10 CONFIRMED-open (prioritized)

Priority = exploitability/data-integrity risk × (low effort first).

| # | ID | Sev | Why it's top | Effort |
|---|---|---|---|---|
| 1 | SEC-004 | High | Unauthenticated cross-tenant email injection — no auth, no signature. Externally reachable. | M |
| 2 | SEC-003 | High | Any authenticated user can register/unregister webhook sources; fix = swap to existing `adminProcedure`. Cheap + high impact. | S |
| 3 | DDD-001 | Critical | Non-atomic lead→deal conversion → partial writes / data corruption on failure. | M |
| 4 | HEX-001 | Critical | `TicketService` bypasses its own port+adapter (dead code); wire the existing `PrismaTicketRepository`. | S |
| 5 | PERF-003 | High | All entity search is `ILIKE '%x%'` seq-scan; add `pg_trgm` GIN indexes. | M |
| 6 | SEC-002 | Medium | RLS never `FORCE`d + privileged role bypasses it; mitigated by app-layer scoping but a real DB defect. Add `FORCE RLS` / non-owner app role. | M |
| 7 | QUAL-015 | Critical | Drifted duplicate `prompt-sanitizer` regex (security-relevant); consolidate to one shared impl. | S |
| 8 | DDD-002 | High | Domain events published outside the persistence tx and swallowed → lost events. Introduce outbox. | M |
| 9 | QUAL-001 | High | Ticket domain transition guards missing (real bugs hidden by `it.skip`); fix guards + un-skip. | M |
| 10 | QUAL-002 | High | Task domain transition/linkage guards missing (hidden by `test.skip`); fix + un-skip. | M |

Remaining CONFIRMED-open (not top-10): HEX-002/003/004 (routing/ticket services → ports), DDD-003 (TenantId VO), DDD-004 (unify score policy), QUAL-012 (fix/withdraw ADR-054 claim), QUAL-013 (SAP suite coverage), GOV-A-001/002/003 (attestation backfill + schema-drift), HEX-005 (de-mix appointments.router persistence).
