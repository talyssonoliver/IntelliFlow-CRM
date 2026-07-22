# ENG-OPS-002 — Remediation Design Proposals (held items)

**Date:** 2026-07-22 · **Author:** ENG-OPS-002 auditor · **Status:** for review
— **no code changes; each item needs an explicit decision before
implementation.**

Wave-1/2 fixes already shipped (R01 SEC-001, R02 QUAL-003/004, R03 STALE-001,
R10 QUAL-001/002). This document covers the items deliberately **held** because
each is a design decision or a large/architectural refactor (the ENG-OPS-002
STOP rules). Each section: **Problem → Ground truth → Options → Recommendation →
Blast radius → Effort → Decision needed.**

Source findings:
`artifacts/reports/sprint-19/baseline/{ddd,hexagonal,quality,governance}-findings.json`.

---

## R04 — DDD-001 (Critical): Lead→Deal conversion transaction atomicity

**Problem.**
`packages/application/src/usecases/leads/ConvertLeadToDealUseCase.ts` persists
Lead + Account + Contact + Opportunity in **separate, unwrapped** saves. A
crash/throw after the first commit leaves orphaned aggregates (e.g. Opportunity
saved, Lead not). Duplicated in `LeadService.convertLead`.

**Ground truth.**

- `packages/db` **already exports**
  `withTransaction(fn: (tx: TransactionClient) => Promise<T>)` and
  `withTransactionOptions` (`packages/db/src/client.ts:205`);
  `OutboxEventBusAdapter` already uses it.
- **Blocker:** every `Prisma*Repository` takes a fixed `prisma: PrismaClient` in
  its constructor (e.g. `PrismaAccountRepository.ts:38`). No repository `save()`
  accepts an optional transaction client, so use-cases can't share one
  transaction today.

**Options.**

1. **Thread an optional `TransactionClient` through repository methods.** Add
   `save(x, tx?: TransactionClient)` to `LeadRepositoryPort` + Account/Contact/
   Opportunity ports and their Prisma adapters; the use-case opens one
   `withTransaction` and passes `tx` to all four saves. **Pros:** minimal new
   abstraction, matches existing `withTransaction`. **Cons:** touches 4 ports +
   4 adapters + the use-case + `LeadService` dup; every `save` signature
   changes.
2. **Introduce a Unit-of-Work / `TransactionManager` port.** A `UnitOfWork` that
   hands scoped repositories inside a transaction. **Pros:** cleanest DDD;
   reusable for R11 (outbox). **Cons:** larger new abstraction; more up-front
   design.
3. **Saga / compensating actions.** Keep separate saves, add rollback steps.
   **Cons:** most complex, still non-atomic windows — not recommended for a
   single-DB write.

**Recommendation:** **Option 1** now (pragmatic, reuses `withTransaction`), and
adopt the same tx-threading for **R11** (domain-event outbox in the same
transaction). Reserve Option 2 for a later DDD hardening pass if tx-threading
proliferates.

**Blast radius:** 4 ports + 4 Prisma adapters + 4 InMemory adapters +
ConvertLeadToDealUseCase + LeadService + their tests. Medium-high. **Effort:**
O/M/P 360/480/720 min. **Depends on:** none (unblocks R11). **Decision needed:**
approve Option 1 (tx-threading) vs Option 2 (UnitOfWork)? And: also de-duplicate
`LeadService.convertLead` vs the use-case in the same PR?

---

## R05 — HEX-001 (Critical): wire the ticket port, or delete the orphan

**Problem.** `apps/api/src/container.ts:564` wires
`new TicketService(prismaClient)` with a **raw PrismaClient**, while a complete
`TicketRepositoryPort` + `PrismaTicketRepository` + `InMemoryTicketRepository`
exist **unused** — dead, untested-in-prod hexagonal code.

**Ground truth.** `PrismaTicketRepository implements TicketRepository`
(`packages/adapters/src/repositories/PrismaTicketRepository.ts:20`) and the
InMemory variant both exist and are exported, but nothing constructs them.

**Options.**

1. **Wire it (make the port real).** Refactor `TicketService` to accept
   `TicketRepository` (port) instead of `PrismaClient`; construct
   `PrismaTicketRepository` in `container.ts`. **Pre-req:** verify the port
   exposes every query/mutation `TicketService` currently issues on raw prisma
   (SLA, status transitions, assignee resolution — `TicketService.ts`).
   **Pros:** honors ADR-047; makes ticket logic unit-testable with InMemory.
   **Cons:** if the port is missing methods, they must be added first.
2. **Delete the orphan.** Remove the port + both adapters, and document (ADR)
   that `apps/api/src/services` is an accepted secondary application layer.
   **Pros:** least code. **Cons:** abandons the hexagonal intent; contradicts
   ADR-047; R08 (ticket hexagonal extraction) then has no port to build on.

**Recommendation:** **Option 1**, as the foundation for **R08** (extract
`TicketService` orchestration into `packages/application` use-cases behind the
port). Do R05 first (wire), then R08 (extract), then R06 pattern for other
routers. **Blast radius:** `TicketService` constructor + all its call sites +
container + tests. Medium. **Effort:** 180/240/360 min. **Depends on:** none;
**blocks** R08. **Decision needed:** wire (Option 1) vs delete (Option 2)? If
wire, confirm we may add any missing port methods in the same PR.

---

## R06 — HEX-005 (Critical): appointments router → use-cases (28 sites)

**Problem.** `apps/api/src/modules/legal/appointments.router.ts` (1,369 lines)
has ~28 direct `ctx.prismaWithTenant` call sites for
list/getById/listByCase/stats/ case-links/attendees, despite 5 mutation
endpoints already migrated to use-cases (`container.ts:611-614` documents the
gap). Router-layer DB access violates ADR-047 / ADR-063.

**Options.**

1. **Complete the migration** — introduce `AppointmentQuery` use-cases
   (list/getById/listByCase/stats) + case/attendee-link use-cases in
   `packages/application/src/usecases/scheduling/`, backed by
   `AppointmentRepositoryPort`, and remove the raw prisma sites. **Pros:**
   finishes what was started; consistent. **Cons:** **20+ file** change — the
   largest single held item.
2. **Incremental** — migrate reads first (list/getById/stats), then
   case/attendee links in a second PR. **Pros:** reviewable chunks. **Cons:**
   two PRs, temporary inconsistency.

**Recommendation:** **Option 2 (incremental, 2 PRs)** — this is too large for
one review. Sequence after R05 (establishes the port-wiring pattern). **Blast
radius:** the appointments router + new use-cases + AppointmentRepository port
methods + tests. Large. **Effort:** 480/600/900 min (split across 2 PRs).
**Depends on:** HEX-011 (per finding). **Decision needed:** approve the 2-PR
incremental split and the `usecases/scheduling/` location.

---

## R07 — QUAL-015 (Critical): consolidate the duplicated prompt-sanitizer

**Problem.** Two security-relevant sanitizers exist and **diverge**:
`apps/api/src/shared/prompt-sanitizer.ts` (333 lines) and
`packages/adapters/src/shared/prompt-sanitizer.ts` (254 lines). Both do
command-injection detection (`DANGEROUS_PATTERNS`) + PII redaction, but the
pattern arrays differ — so the two call paths have **different security
coverage**.

**Options.**

1. **Single canonical module (recommended location: a new `packages/security` or
   `packages/validators`).** Consolidate the **union/superset** of both
   `DANGEROUS_PATTERNS` + PII patterns, re-export from both current call sites,
   and add an architecture test asserting no second copy exists. **Security
   decision:** which patterns are authoritative — the api version (333 lines)
   appears more complete, but each divergent pattern must be reviewed so
   consolidation does not silently _drop_ a detection.
2. **Pick one file as canonical, delete the other, re-point imports.** Simpler,
   but still requires the same pattern-by-pattern review to avoid coverage
   regressions.

**Recommendation:** **Option 1** with a **security review of the pattern diff**
before merge — this is why it's held: blindly taking either file could weaken
injection/PII coverage. Produce a side-by-side pattern diff first (I can
generate it) for security-lead sign-off, then consolidate. **Blast radius:** 2
sanitizer files + their importers + a new package or shared module + arch test.
Medium. **Effort:** 180/240/360 min. **Decision needed:** (a) canonical location
(`packages/security` new vs `packages/validators`)? (b) approve "union of
patterns" as the merge rule, pending the pattern-diff review?

---

## Architectural Highs (Wave 2) — proposals

### R08 — HEX-002/003: ticket service → use-cases behind the port

Depends on **R05**. Extract `TicketService` orchestration (SLA, transitions,
assignee resolution) + `TicketRoutingService` into
`packages/application/src/usecases/`, consuming `TicketRepositoryPort`; leave a
thin `apps/api` adapter forwarding to the use-case. **Effort:** 360/540/720.
**Decision:** do R05→R08 as a pair, or one combined PR?

### R11 — DDD-002: persist domain events (outbox) in the aggregate transaction

Depends on **R04** (same tx-threading). Extend repository `save` to write outbox
rows inside the `withTransaction` that persists the aggregate (ADR-011
zero-lost- events). `OutboxEventBusAdapter` already uses `withTransaction`, so
the pattern exists. **Effort:** 240/360/540. **Decision:** bundle with R04 or
separate PR?

### R12 — DDD-003/004: `TenantId` value object + lead auto-qualify into the aggregate

- **DDD-003:** introduce `TenantId` VO
  (`packages/domain/src/shared/TenantId.ts`) mirroring the existing
  `Email`/`PhoneNumber` `Result`-returning `create()`; migrate **incrementally**
  (163 raw `tenantId: string` across 49 files — do NOT big-bang). Start at the
  Lead aggregate boundary.
- **DDD-004:** move the auto-qualify score-threshold policy from `LeadService`
  into `Lead.applyAiScore(...)` so it can't be bypassed. **Effort:**
  600/840/1200 (large; phase it). **Decision:** approve incremental VO migration
  (aggregate-by-aggregate) rather than a single sweep?

### R15 — GOV-A-003: schema-validation triage (175/447 failing)

`pnpm validate:schemas` is RED (175/447). Proposal: bucket the 175 failures by
schema type, decide per-bucket **regenerate schema** (structure legitimately
evolved) vs **fix artifact** (drift), then wire `validate:schemas` into pre-ship
as a hard gate (GOV-A-005). **Effort:** 360/600/900. **Decision:** I can produce
the per-schema failure histogram first so you can approve the regenerate-vs-fix
split.

### RACE-PURE-09 (deferred from R10): task state-machine enforcement

`VALID_TASK_TRANSITIONS` exists but `changeStatus`/`complete` don't enforce it.
Enforcing tightens the contract: `complete()` on a PENDING task would be
rejected (breaks the "complete on PENDING succeeds" property + any service
caller that completes un-started tasks). **Decision:** confirm the intended rule
(must a task be IN_PROGRESS before COMPLETED?) and whether callers exist that
rely on the loose behavior — then it becomes a clean fix.

---

## Suggested decision batch

To unblock the most value fastest, the highest-leverage decisions are: **R04
Option 1** (unblocks R11), **R05 Option 1** (unblocks R08), and the **R07
pattern- diff review** (security). R06/R12/R15 are large and can be phased.
Reply with a decision per item (or "proceed with all recommendations") and I'll
implement them as separate PRs, each with tests + attestation, in dependency
order.
