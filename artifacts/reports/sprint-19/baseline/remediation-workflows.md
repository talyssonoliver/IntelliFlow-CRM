# ENG-OPS-002 Remediation Workflows

**Source:** `findings-validation.md` (24 Critical/High validated: 0 false positives, 3 already-fixed, 2 severity-corrected).
**Scope of this doc:** the **21 actionable** CONFIRMED findings (19 open + SEC-002/HEX-005 corrected). Excludes SEC-001, QUAL-003, QUAL-004 (already remediated by #602/#603).
**NOT added to `Sprint_plan.csv`** — this is a bounded-workflow proposal only.

> ⚠️ **Reconciliation caveat:** These workflows are finding-driven. **R01/R02/R03/R10 are now MERGED** (#601/#602/#603/#604); **R04–R07 are held for design sign-off** (see `eng-ops-002-remediation-design-proposals.md`). `fix-ticket-domain-guards` is done and `fix-task-domain-guards` is partial (both via R10 — see their entries below). Before executing any workflow, cross-check it doesn't overlap a held/merged R-item.
>
> 🔎 **Independent Codex cross-check:** `codex-findings-review.md` — 0 false positives confirmed; **one open dispute: SEC-002 severity (Codex=High vs this doc's Medium)** → the `force-rls-on-tenant-tables` workflow may be P0, not P1, pending that call.

Each workflow: **title** (kebab-case ≤6 words) · **findings** · **scope (files:lines)** · **verifiable DoD** · **effort** S/M/L · **hex layer** · **bounded context** · **dependency**.

---

## Wave 1 — Security hardening (do first; externally exploitable)

### `sign-inbound-email-webhook`
- **Findings:** SEC-004
- **Scope:** `apps/api/src/modules/email/inbound.router.ts:216-266` (webhook procedure), `:1295-1318` (`resolveTenantForInboundEmail`)
- **DoD:** webhook rejects any request without a valid provider HMAC/shared-secret signature (401) *before* tenant resolution; a test asserts a spoofed inbound email for a known domain is rejected; legitimate signed payload still processes.
- **Effort:** M · **Layer:** api-router · **Context:** communications · **Dep:** none

### `gate-webhook-source-admin`
- **Findings:** SEC-003
- **Scope:** `apps/api/src/modules/webhooks/webhooks.router.ts:116` (`registerSource`), `:146` (`unregisterSource`)
- **DoD:** both procedures use the existing `adminProcedure` (`trpc.ts:256`); a non-admin authenticated caller receives FORBIDDEN; a test enumerates `_def.procedures` and asserts the admin guard.
- **Effort:** S · **Layer:** api-router · **Context:** platform · **Dep:** none

### `force-rls-on-tenant-tables`
- **Findings:** SEC-002 (Medium, mitigated)
- **Scope:** `packages/db/prisma/migrations/**` (add `FORCE ROW LEVEL SECURITY`), `packages/db/src/client.ts:125`, `apps/api/src/security/tenant-context.ts:163/325`
- **DoD:** either `FORCE ROW LEVEL SECURITY` on tenant tables **or** the app connects via a documented non-owner role; a SQL/integration check proves a table-owner query can no longer bypass the tenant policy. (Defense-in-depth app scoping stays.)
- **Effort:** M · **Layer:** infrastructure/db · **Context:** platform · **Dep:** none (coordinate w/ DB migration window)

### `consolidate-prompt-sanitizer`
- **Findings:** QUAL-015 (Critical)
- **Scope:** `apps/api/src/shared/prompt-sanitizer.ts:77`, `packages/adapters/src/shared/prompt-sanitizer.ts:64`
- **DoD:** one shared implementation (single regex, incl. `sanitizeOutput`); both call sites import it; the drifted `[^\r\n]` vs `[^\n]` divergence gone; existing sanitizer tests pass against the unified module.
- **Effort:** S · **Layer:** cross-cutting · **Context:** ai · **Dep:** none

---

## Wave 2 — Transactional integrity (data-corruption risk)

### `atomic-lead-to-deal-conversion`
- **Findings:** DDD-001 (Critical)
- **Scope:** `packages/application/src/usecases/leads/ConvertLeadToDealUseCase.ts:97` (+ the 3 save blocks ~176/252/298), `packages/application/src/services/LeadService.ts` `convertLead()` (~354/388)
- **DoD:** all aggregate saves execute inside a single `$transaction`/unit-of-work; an induced mid-conversion failure rolls back every write (test asserts no partial Account/Contact/Lead state).
- **Effort:** M · **Layer:** application · **Context:** leads · **Dep:** none

### `transactional-outbox-lead-events`
- **Findings:** DDD-002
- **Scope:** `CreateLeadUseCase.ts:69-84`, `LeadService.publishEvents()` (~698), `ConvertLeadToDealUseCase.publishEvents()` (~370)
- **DoD:** domain events are written to an outbox within the same persistence transaction (no post-save best-effort `console.error` swallow); a test proves events are not lost when the publish step fails.
- **Effort:** L · **Layer:** application/adapters · **Context:** leads · **Dep:** may share infra with `atomic-lead-to-deal-conversion`

---

## Wave 3 — Hexagonal composition (wire existing ports)

### `wire-ticket-repository-port`
- **Findings:** HEX-001 (Critical), HEX-002
- **Scope:** `apps/api/src/container.ts:564`, `apps/api/src/services/TicketService.ts:19`, existing `TicketRepositoryPort` + `PrismaTicketRepository`
- **DoD:** `TicketService` depends on `TicketRepositoryPort` (no direct `PrismaClient`), moved under `packages/application`; container wires `PrismaTicketRepository`; the previously-dead adapter is now used; tests green.
- **Effort:** M · **Layer:** application/adapters · **Context:** tickets · **Dep:** none

### `port-routing-services`
- **Findings:** HEX-003, HEX-004
- **Scope:** `apps/api/src/services/TicketRoutingService.ts:47`, `apps/api/src/services/LeadRoutingService.ts:98`, `container.ts:567/570`
- **DoD:** both routing services depend on repository ports with Prisma adapters wired in the container; no raw `PrismaClient` in the services; tests green.
- **Effort:** M · **Layer:** application/adapters · **Context:** tickets/leads · **Dep:** pattern from `wire-ticket-repository-port`

### `de-mix-appointments-persistence`
- **Findings:** HEX-005 (Medium, re-scoped)
- **Scope:** `apps/api/src/modules/legal/appointments.router.ts:487/548/729` (writes), reads at `:662/1150/1296`
- **DoD:** direct `ctx.prismaWithTenant.appointment.*` **writes** are routed through container use-cases (reads may remain per the sanctioned repo convention); a lint/arch test asserts no direct write in this router.
- **Effort:** M · **Layer:** api-router · **Context:** legal/scheduling · **Dep:** none

---

## Wave 4 — Domain invariants & test-guard restoration

### `tenant-id-value-object`
- **Findings:** DDD-003
- **Scope:** `packages/domain/src/crm/lead/Lead.ts:65` (+ new `packages/domain/src/shared/TenantId.ts`)
- **DoD:** a validated `TenantId` value object exists; `Lead` uses it instead of raw `string`; domain tests cover invalid tenant ids. **⚠ blast radius:** scope to Lead first, then fan out to sibling aggregates in follow-ups.
- **Effort:** M · **Layer:** domain · **Context:** cross-cutting · **Dep:** none

### `unify-lead-score-policy`
- **Findings:** DDD-004
- **Scope:** `packages/application/src/services/LeadService.ts:22-28/231`, `packages/domain/src/crm/lead/LeadScore.ts:47`
- **DoD:** one canonical threshold/tier definition on the domain (`LeadScore`); the app service's auto-qualify delegates to it; the divergent 75/20 vs 80/50 boundaries reconciled; tests updated.
- **Effort:** S · **Layer:** domain/application · **Context:** leads · **Dep:** none

### `fix-ticket-domain-guards` — ✅ DONE (R10 / #604)
- **Findings:** QUAL-001
- **Status:** COMPLETE. `changePriority`/`assign`/`unassign` now guard `isClosed || isTerminalStatus`, `resumeSla` clamps; the 5 ticket property tests are un-skipped and green. No further action.

### `fix-task-domain-guards` — ⚠ PARTIAL (R10 / #604); scope reduced
- **Findings:** QUAL-002
- **Status:** terminal-linkage guards DONE — `Task.assertLinkable()` shipped, 3 RACE-PURE-M2 tests un-skipped (#604).
- **Remaining scope (RACE-PURE-09 only):** `Task.changeStatus`/`complete()` do not enforce `VALID_TASK_TRANSITIONS` (the table exists; enforcement tightens the contract — `complete()` on a PENDING task would be rejected, which breaks the "complete on PENDING succeeds" property and needs service-caller verification). 2 tests still skipped.
- **Scope:** `packages/domain/src/crm/task/Task.ts` (`changeStatus`/`complete`), `tests/property/unit/crm/task-domain.prop.test.ts:271/284`
- **DoD:** `changeStatus`/`complete` consult `VALID_TASK_TRANSITIONS`; the 2 RACE-PURE-09 tests un-skipped and green; existing callers that complete un-started tasks audited/updated.
- **Effort:** S-M · **Layer:** domain · **Context:** tasks · **Dep:** none

---

## Wave 5 — Performance

### `trigram-search-indexes`
- **Findings:** PERF-003
- **Scope:** new migration under `packages/db/prisma/migrations/**`; queries in `apps/api/src/modules/misc/global-search.router.ts:67+`
- **DoD:** `pg_trgm` extension enabled; GIN `gin_trgm_ops` indexes on the searched text columns (Lead/Contact/Account/Opportunity/Ticket); `EXPLAIN` shows index usage for a representative `ILIKE '%x%'` (or documented benchmark).
- **Effort:** M · **Layer:** infrastructure/db · **Context:** cross-cutting · **Dep:** none

---

## Wave 6 — Governance & test hygiene

### `backfill-sprint18-attestations`
- **Findings:** GOV-A-001, GOV-A-002
- **Scope:** `.specify/sprints/sprint-18/attestations/{PG-196..209,INFRA-TF-001..005}/`, `task-reconciliation.csv`
- **DoD:** the 18 missing `attestation.json` generated from canonical sources; the 177 provenance-incomplete Completed tasks reconciled (or explicitly waived); reconciliation report shows the gap closed.
- **Effort:** L · **Layer:** cross-cutting · **Context:** platform · **Dep:** none

### `fix-attestation-schema-drift`
- **Findings:** GOV-A-003
- **Scope:** attestation files flagged in `tool-runs/validate-schemas` (175 failing)
- **DoD:** `validate-schemas` reports 0 failed (bad sha256 patterns/types corrected) or documented, tracked waivers; gate green.
- **Effort:** L · **Layer:** cross-cutting · **Context:** platform · **Dep:** may follow `backfill-sprint18-attestations`

### `correct-adr-054-enforcement-claim`
- **Findings:** QUAL-012
- **Scope:** `docs/architecture/adr/ADR-054-property-based-race-condition-testing.md:263` (+ header status)
- **DoD:** the ADR's `no-skipped-tests` claim matches reality — *either* the ESLint rule is actually added and enforced, *or* the text is corrected; ADR status updated from `Proposed`.
- **Effort:** S · **Layer:** cross-cutting · **Context:** platform · **Dep:** synergy with the Wave-4 un-skips

### `restore-sap-adapter-coverage`
- **Findings:** QUAL-013
- **Scope:** `tests/integration/connectors/erp.test.ts:24`, task IFC-099
- **DoD:** the `describe.skip` SAP suite executes once the adapter is ready, *or* is converted to an explicit tracked-pending tied to IFC-099 with a coverage plan (no silent skip).
- **Effort:** M · **Layer:** adapters · **Context:** platform/integrations · **Dep:** IFC-099

---

## Wave summary

| Wave | Theme | Workflows | Findings | Priority |
|---|---|---|---|---|
| 1 | Security hardening | 4 | SEC-004, SEC-003, SEC-002, QUAL-015 | P0 |
| 2 | Transactional integrity | 2 | DDD-001, DDD-002 | P0/P1 |
| 3 | Hexagonal composition | 3 | HEX-001/002, HEX-003/004, HEX-005 | P1 |
| 4 | Domain invariants & guards | 4 | DDD-003, DDD-004, QUAL-001, QUAL-002 | P1 |
| 5 | Performance | 1 | PERF-003 | P1 |
| 6 | Governance & test hygiene | 4 | GOV-A-001/002/003, QUAL-012, QUAL-013 | P2 |

**18 workflows** covering **21 findings**. Suggested order: Wave 1 → 2 → 3/4/5 (parallelizable) → 6. Wave 1's `gate-webhook-source-admin` (S) and Wave 3's `wire-ticket-repository-port` (S-M, adapter already built) are the cheapest high-value quick wins.
