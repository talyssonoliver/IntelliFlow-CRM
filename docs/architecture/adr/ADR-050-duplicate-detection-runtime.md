# ADR-050: Duplicate-Detection Runtime for Contacts & Accounts

**Status:** Accepted

**Date:** 2026-04-20

**Accepted Date:** 2026-04-20

**Deciders:** Backend Eng (STOA-Domain), Data-Engineer, AI-Specialist,
Domain-Expert

**Technical Story:** IFC-310 (follow-up to PG-182 / PG-183)

## Context and Problem Statement

PG-182 (Contact Settings) and PG-183 (Account Settings) shipped the
**configuration surface** for duplicate detection: users can now author
`ContactDuplicateRule` / `AccountDuplicateRule` rows and flip
`autoMergeOnExactEmail`, `autoLinkContactsByDomain`, `notifyOnDuplicate`,
`aiDuplicateDetection`, `aiIndustryInference`, and `aiEnrichment` toggles via
tRPC settings routers. The runtime that **reads** those rules and acts on them
does not exist.

Today, `contact.router.ts` and `account.router.ts` `create`/`update` procedures
already call `loadContactAutomation()` / `loadAccountAutomation()`, read the
flags, and then **never branch on them** for duplicate detection — the flags are
silently dropped (see `contact.router.ts:379`, `account.router.ts:64`). As a
result the settings page is Cat-1-dead for duplicate-related functionality even
though PG-182/PG-183 are marked Completed. IFC-310 closes this gap.

The architectural question is: how should the duplicate-detection runtime be
structured so that (a) it's tenant-safe, (b) merges are atomic, (c) AI
similarity degrades gracefully when embeddings aren't available, and (d) child
rows (activities, notes, opportunities, tags, aiInsight) are correctly
re-parented on merge?

## Decision Drivers

- **Tenant isolation**: merges MUST never cross tenant boundaries. The existing
  `getTenantContext(ctx)` + `prismaWithTenant` extension pattern is
  authoritative (see ADR-025).
- **Atomicity**: a failed merge that deletes the secondary but fails to
  re-parent a child row produces an orphan. Unacceptable.
- **Latency**: the duplicate check runs in the request path of every
  contact/account create+update. p95 budget <500 ms.
- **Graceful AI degradation**: `Account` has no embedding column and
  `Contact.embedding` exists but is never populated in production. The runtime
  must not hard-fail when embeddings are null.
- **DRY across entities**: contacts and accounts share ~80% of the
  rule-evaluation logic (field matching, threshold comparison, notification
  emission). They differ only in (i) rule fields, (ii) action verbs (merge vs.
  link), (iii) AI toggle name.
- **ADR-002 / ADR-047 (DDD/hexagonal)**: business rules belong in
  `packages/application/services/` or `packages/domain/`, not in router files.
  Merge orchestration is a domain concern.
- **Binary notification schema**: adding new notification types requires
  updating `packages/validators/src/notifications.ts` (closed Zod enum) — a
  runtime push that does not validate fails loudly.

## Considered Options

### Option A — Inline in router (rejected)

Put all rule evaluation, AI similarity, merge, and notification emission
directly inside the `create`/`update` procedures in `contact.router.ts` /
`account.router.ts`.

- Bad, violates ADR-002 (business logic in routers)
- Bad, duplicates ~300 LOC between contact and account routers
- Bad, unit-testing requires booting tRPC context
- Bad, entangles duplicate-detection tests with unrelated router changes

### Option B — One shared service with entity-discriminated switch (rejected)

Single `DuplicateDetectionService` that takes `entity: 'contact' | 'account'`
and branches internally.

- Bad, switch-based polymorphism is an anti-pattern; the two entities have
  different field schemas, different merge-vs-link verbs, different child tables
  to re-parent, different AI toggles. Branching inside the service creates a
  god-object.
- Bad, inverts the dependency direction: the "shared" service would import both
  `ContactService` and `AccountService`.

### Option C — Per-entity service sharing a pure-function evaluator (CHOSEN)

- One shared stateless evaluator at
  `apps/api/src/shared/duplicate-rule-evaluator.ts` that takes
  `(candidate, existingRows, rules)` → `DuplicateMatch[]`. Pure, synchronous, no
  Prisma dependency, no tenant context — trivial to unit-test.
- Two per-entity services:
  - `apps/api/src/modules/contact/contact-duplicate-detection.service.ts` —
    loads rules, fetches candidate existing contacts via `prismaWithTenant`,
    calls evaluator, decides flag/auto-merge/notify, invokes hardened
    `ContactService.mergeContacts` under transaction.
  - `apps/api/src/modules/account/account-duplicate-detection.service.ts` — same
    shape but acts through auto-link (setting `Contact.accountId`), not merge.
- Router just calls `await contactDuplicateService.check(ctx, candidate)`
  post-hygiene, pre-persist.

## Decision Outcome

**Chosen: Option C** — shared evaluator + per-entity services.

### Runtime diagram

```
contact.router.ts create
  ├─> loadContactAutomation()        (already exists)
  ├─> [hygiene]                       (already exists)
  └─> ContactDuplicateDetectionService.checkAndActOnCreate(ctx, candidate, flags)
        ├─> load active ContactDuplicateRule[] for tenant
        ├─> fetch candidate existing contacts (by email+tenant, domain+tenant, etc.)
        ├─> [optional] compute candidate embedding via EmbeddingChain (worker-dispatched, not inline)
        ├─> call duplicateRuleEvaluator(candidate, existing, rules) → matches
        ├─> if AI enabled AND embedding available: findSimilarContacts() union into matches
        ├─> decide action per match:
        │     - exact email match + autoMergeOnExactEmail → invoke mergeContacts (atomic)
        │     - any match + notifyOnDuplicate → emit contact_duplicate_suspected notification
        │     - otherwise → return { proceed: true, flaggedMatches: matches }
        └─> router proceeds to createContact with match metadata attached
```

### Transaction boundary for merge

One interactive `prismaWithTenant.$transaction(async (tx) => { ... })` wraps, in
order:

1. Re-verify both contact IDs belong to `ctx.tenant.tenantId` (reject
   cross-tenant under tx).
2. `tx.contactActivity.updateMany({ where: { contactId: secondaryId, tenantId }, data: { contactId: primaryId } })`
3. `tx.contactNote.updateMany(...)` — same shape
4. `tx.opportunity.updateMany({ where: { contactId: secondaryId, tenantId }, data: { contactId: primaryId } })`
5. `tx.contactTagAssignment.updateMany(...)` — with conflict handling
   (skipDuplicates is not allowed; use `deleteMany` + `createMany` with de-duped
   union)
6. `tx.contactAIInsight.updateMany(...)`
7. `tx.contact.update({ where: { id: primaryId, tenantId }, data: { ...mergedFields } })`
   — field merge policy from `ContactService.mergeContacts:484`
8. `tx.contact.delete({ where: { id: secondaryId, tenantId } })`

Post-commit (outside tx):

- `createNotification(ctx.prismaWithTenant, { type: 'contact_duplicate_suspected', payload: { action: 'auto-merged', ... } }, ctx.services?.notificationOrchestrator)`
  — fire-and-forget
- `getAuditLogger(ctx.prisma).logAction('MERGE', 'contact', primaryId, tenantId, { actorId, mergedContactId: secondaryId, fieldsUpdated })`
  — fire-and-forget
- `eventBus.publish(new ContactMergedEvent({ primaryId, mergedContactId, tenantId, mergedBy, mergedAt }))`
  — persisted via outbox (ADR-011)

### Embedding path

- Inline computation is forbidden. LLM latency (even Ollama local) exceeds the
  <500 ms p95 budget.
- New BullMQ queue `intelliflow-contact-embed` dispatched after `createContact`
  commits. Worker lives in `apps/ai-worker/src/workers/contact-embed-worker.ts`.
  Job payload: `{ contactId, tenantId }`.
- Worker uses
  `EmbeddingChain.generateEmbedding({ text: contactToText(contact) })`
  (`apps/ai-worker/src/chains/embedding.chain.ts:72`) and writes back via
  `updateContactEmbedding()` (`packages/db/src/pgvector.ts:273`).
- `ContactDuplicateDetectionService.check` does NOT wait for the worker. It only
  queries `findSimilarContacts()` against _already-populated_ embeddings. The
  first contact in a tenant has no similarity data; by the second create the
  first's embedding is usually ready.
- `Account` has no embedding column and no AI similarity path in IFC-310.
  AI-based duplicate detection for accounts is explicitly out-of-scope and
  tracked as a follow-up. `aiIndustryInference` and `aiEnrichment` toggles are
  consulted only for logging/telemetry in IFC-310 — no behavior change.

### Notification schema extension

Add two literals to `NOTIFICATION_TYPES` in
`packages/validators/src/notifications.ts`:

- `'contact_duplicate_suspected'`
- `'account_duplicate_suspected'`

Payload discriminator field `action: 'flagged' | 'auto-merged' | 'auto-linked'`
is carried in the existing free-form `metadata` field (JSON) on `Notification` —
no schema change required there.

### Positive Consequences

- Pure evaluator is trivially unit-testable without Prisma / tRPC / AI.
- Per-entity services own their own Prisma queries, merge semantics, and AI
  toggle names — no cross-entity coupling.
- Embedding worker dispatch keeps the request path inside budget.
- Graceful degradation: missing embedding column or null embeddings don't crash
  the runtime; deterministic rules still fire.
- Atomic merge in one `$transaction` closes the orphan-child risk present in the
  current `ContactService.mergeContacts` (which save-then-deletes across two
  round-trips).

### Negative Consequences

- The account AI duplicate detection is intentionally non-functional in IFC-310.
  Users who flip `aiIndustryInference` on and expect fuzzy account detection
  will need to wait for the follow-up (`FOLLOWUP-IFC-310-ACCOUNT-EMBEDDING`,
  tracked separately).
- First-creation-per-tenant is always a deterministic-only check (no prior
  embedding to compare). Acceptable.
- `ContactService.mergeContacts` in `packages/application/` is hardened under
  IFC-310 — its existing test suite (12 tests) must be updated. Breaking-change
  risk for any future callers.
- New BullMQ queue `intelliflow-contact-embed` adds ops surface (retry config,
  DLQ, Grafana panels). Reuse existing queue conventions from
  `apps/ai-worker/src/workers/reindex-worker.ts`.

## Links

- **Refines** ADR-011 (Domain events) — new `ContactMergedEvent`
- **Refines** ADR-002 (DDD) — domain-layer merge orchestration
- **Refines** ADR-047 (Hexagonal architecture) — service boundary respected
- **Refines** ADR-025 (Tenant ID normalization) — merge uses `prismaWithTenant`
  throughout
- **Depends on** PG-182, PG-183 (Completed sprint-17)
- **Task**
  [IFC-310](../../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)

## Implementation Notes

### Validation Criteria

- [ ] Rule evaluator has zero Prisma / tRPC imports (pure function)
- [ ] Per-entity services use `prismaWithTenant`, never raw `prisma`
- [ ] Merge transaction asserts `tenantId` match on both IDs before any write
- [ ] Zero cross-tenant merges verified via integration test
- [ ] p95 merge latency <500 ms
- [ ] Scoped coverage ≥90% for new services + evaluator
- [ ] `contact_duplicate_suspected` + `account_duplicate_suspected` added to
      `NOTIFICATION_TYPES`
- [ ] All 4 validations pass (TypeScript, Tests, Lint, Build)

### Rollback Plan

- Feature flag at the service layer: if `ENABLE_DUPLICATE_DETECTION=false`, the
  service's `check()` immediately returns
  `{ proceed: true, flaggedMatches: [] }`. No router change needed to roll back.
- Notification type additions are append-only to the enum — no migration
  required; old clients simply won't recognise the new types.
- Embedding worker is independent; disable the queue worker process to stop new
  embeddings from being computed. No data loss.
