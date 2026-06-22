# Router Audit-Logging Playbook

**Status**: Canonical. Created 2026-06-22 after the IFC-240 (lead router) and
IFC-255 (contact router) instrumentation rounds.

Any task that adds GDPR / SOC2 audit logging to a tRPC router (IFC-256 accounts,
IFC-257 deals, IFC-2xx tickets/cases/documents, …) MUST follow this playbook
from day one. Every rule below is a **real review finding that already cost a
codex or SonarCloud rework round** on IFC-240 — self-implement against this doc
and you should clear the gates on the first push.

> **Conventions in this doc.** Code blocks use the **concrete `contact` /
> `Contact`** names from the IFC-255 reference implementation so they are real,
> copy-pasteable, and survive `prettier --write` unchanged. When you apply the
> pattern to another router, substitute your entity (`account` / `Account`,
> `deal` / `Deal`, …) — the prose refers to that substitution as `<entity>` /
> `<Entity>`.

Reference implementations (read before you start):

- **Lead (canonical, 16 procedures):**
  `apps/api/src/modules/lead/lead.router.ts` — the original IFC-240 template.
- **Contact (18 procedures, the widest surface):**
  `apps/api/src/modules/contact/contact.router.ts` — IFC-255.
- **Audit logger facade:** `apps/api/src/security/audit-logger.ts`
  (`getAuditLogger(prisma)` singleton → `logAction` / `logBulkOperation`).
- **Handlers:** `apps/api/src/security/audit/handlers/crud-handler.ts` +
  `bulk-handler.ts` (`createCrudEntry` / `createBulkOperationEntry`).
- **Event registry:** `apps/api/src/security/audit-event-handler.ts`
  (`EVENT_AUDIT_MAPPINGS`).
- **Tests:**
  `apps/api/src/modules/contact/__tests__/contact.router.audit-logging.test.ts`
  (20 tests) and the `T-011` static guard inside
  `contact.router.security.test.ts`.

---

## 0. The one-paragraph summary

Every state-changing procedure and every single-record read of personal data
gets a **fire-and-forget** audit call appended **after the business result is
committed** and **before the `return`**. Mutations log `CREATE` / `UPDATE` /
`DELETE` / `AI_SCORE` with a real before/after diff; reads log `READ`; bulk ops
log `BULK_UPDATE` / `BULK_DELETE` / `EXPORT` with attempted ids +
success/failure counts + the successful ids in metadata. The call NEVER blocks
or alters the result — its rejection routes to a shared
`.catch(logContactAuditFailure)` handler. That is the whole pattern; the rest of
this doc is the details that trip the gates.

---

## 1. Imports + shared failure handler (do this once, top of file)

```ts
// IFC-2xx: fire-and-forget audit logging for contact mutations + single reads
import { getAuditLogger } from '../../security/audit-logger';
```

```ts
/**
 * IFC-2xx: shared fire-and-forget audit-failure handler. Audit logging must
 * never alter or block a procedure's result, so every audit call routes its
 * rejection here instead of propagating into the request path.
 */
function logContactAuditFailure(err: unknown): void {
  console.error('[contact.router] Audit log failed:', err);
}
```

- `getTenantContext(ctx)` is already imported in every router; reuse its
  `typedCtx.tenant.tenantId` / `typedCtx.tenant.userId`.
- Use `ctx.prisma` (the **unscoped** client) for `getAuditLogger(ctx.prisma)` —
  the audit logger writes to the audit table with its own tenant column from the
  `tenantId` arg; do NOT pass `prismaWithTenant` (RLS would scope it wrong).

---

## 2. The call shapes (copy these, change only the payload)

### 2a. CREATE — afterState only

```ts
// IFC-2xx: fire-and-forget audit logging
getAuditLogger(ctx.prisma)
  .logAction(
    'CREATE',
    'contact',
    result.value.id.value,
    typedCtx.tenant.tenantId,
    {
      actorId: typedCtx.tenant.userId,
      dataClassification: 'CONFIDENTIAL',
      afterState: {
        email: result.value.email.value,
        // …only the fields that identify/describe the created row
      },
    }
  )
  .catch(logContactAuditFailure);
```

### 2b. READ — single-record personal-data access (GDPR Art. 30)

```ts
// IFC-2xx: GDPR single-record access logging (fire-and-forget)
getAuditLogger(ctx.prisma)
  .logAction('READ', 'contact', input.id, typedCtx.tenant.tenantId, {
    actorId: typedCtx.tenant.userId,
    eventType: 'ContactRead', // REQUIRED — see §3 (READ has no valid auto-derivation)
    dataClassification: 'CONFIDENTIAL',
  })
  .catch(logContactAuditFailure);
```

Only log `getById` / single-record reads. Do **not** log `list` / `search` /
count queries — they fire per keystroke and would flood the audit table.

### 2c. UPDATE — real before/after diff over exactly the changed fields

```ts
// IFC-2xx: before/after diff over exactly the fields this update changed —
// covers every editable field, not a fixed subset.
const auditAfter: Record<string, unknown> = { ...rest };
if (phone !== undefined) auditAfter.phone = phone?.value ?? null;
const auditBefore = beforeRow
  ? Object.fromEntries(
      Object.keys(auditAfter).map((k) => [
        k,
        (beforeRow as Record<string, unknown>)[k] ?? null,
      ])
    )
  : undefined;
getAuditLogger(ctx.prisma)
  .logAction('UPDATE', 'contact', id, typedCtx.tenant.tenantId, {
    actorId: typedCtx.tenant.userId,
    dataClassification: 'CONFIDENTIAL',
    beforeState: auditBefore,
    afterState: auditAfter,
  })
  .catch(logContactAuditFailure);
```

The diff is keyed off `auditAfter`, so `beforeState` only carries the fields
that actually changed — no fixed allow-list to keep in sync, no unrelated
columns leaking into the audit row. You must already have a `beforeRow` snapshot
(see §2d).

### 2d. DELETE — snapshot BEFORE erasure

```ts
// IFC-2xx: snapshot the row BEFORE erasure so the GDPR audit entry records what
// was deleted (the row is gone afterwards).
const beforeRow = await typedCtx.prismaWithTenant.contact.findUnique({
  where: { id: input.id },
});

const result = await contactService.delete(input.id);
// …error handling…

getAuditLogger(ctx.prisma)
  .logAction('DELETE', 'contact', input.id, typedCtx.tenant.tenantId, {
    actorId: typedCtx.tenant.userId,
    dataClassification: 'CONFIDENTIAL',
    beforeState: beforeRow
      ? {
          email: beforeRow.email,
          status: beforeRow.status /* identifying fields */,
        }
      : undefined,
  })
  .catch(logContactAuditFailure);
```

### 2e. AI_SCORE — INTERNAL, actorType AI_AGENT, before/after score

```ts
getAuditLogger(ctx.prisma)
  .logAction('AI_SCORE', 'contact', input.id, typedCtx.tenant.tenantId, {
    actorId: typedCtx.tenant.userId,
    actorType: 'AI_AGENT',
    eventType: 'ContactScored',
    dataClassification: 'INTERNAL', // a score is derived, not raw PII
    beforeState: { score: result.value.previousScore },
    afterState: {
      score: result.value.newScore,
      confidence: result.value.confidence,
    },
  })
  .catch(logContactAuditFailure);
```

### 2f. Domain verbs that are still UPDATE (link, unlink, reassign, note, tag, activity)

These mutate a row but are not plain CRUD, so they log `UPDATE` with an
**explicit `eventType`**:

```ts
getAuditLogger(ctx.prisma)
  .logAction('UPDATE', 'contact', input.contactId, typedCtx.tenant.tenantId, {
    actorId: typedCtx.tenant.userId,
    eventType: 'ContactLinkedToAccount', // or …Reassigned, …NoteAdded, …TagsAdded, …
    dataClassification: 'CONFIDENTIAL',
    metadata: { accountId: input.accountId },
  })
  .catch(logContactAuditFailure);
```

### 2g. BULK — attempted ids + success/failure counts + successful ids

```ts
getAuditLogger(ctx.prisma)
  .logBulkOperation(
    'BULK_UPDATE',
    'contact',
    input.ids,
    typedCtx.tenant.tenantId,
    {
      // 3rd arg `input.ids` = ALL attempted ids
      actorId: typedCtx.tenant.userId,
      dataClassification: 'CONFIDENTIAL',
      successCount: result.successful.length,
      failureCount: result.failed.length,
      metadata: { operation: 'reassign', successfulIds: result.successful },
    }
  )
  .catch(logContactAuditFailure);
```

- Bulk verbs: `BULK_UPDATE` (bulk edit / reassign / bulk-score), `BULK_DELETE`
  (bulk delete), `EXPORT` (bulk export — exporting PII is an auditable event
  even though it mutates nothing).
- Pass **all attempted ids** as the 3rd arg and the **successful ids** in
  `metadata.successfulIds` — the diff between them is the audit value.

---

## 3. The eventType derivation trap (cost a SonarCloud round on IFC-240)

`createCrudEntry` auto-derives `eventType` as
`` `${Resource}${action[0] + action.slice(1).toLowerCase()}d` `` — i.e. it
appends a literal **`d`**. That is ONLY correct for verbs whose past tense is
the verb + `d`:

| action                               | auto-derived eventType | valid?                                           |
| ------------------------------------ | ---------------------- | ------------------------------------------------ |
| `CREATE`                             | `ContactCreated`       | ✅ correct                                       |
| `UPDATE`                             | `ContactUpdated`       | ✅ correct                                       |
| `DELETE`                             | `ContactDeleted`       | ✅ correct                                       |
| `READ`                               | `ContactReadd`         | ❌ malformed → pass `eventType: 'ContactRead'`   |
| `AI_SCORE`                           | `ContactAi_scored`     | ❌ malformed → pass `eventType: 'ContactScored'` |
| domain verb (link/reassign/note/tag) | n/a                    | ❌ → pass explicit eventType                     |

**Rule:** only `CREATE` / `UPDATE` / `DELETE` may rely on auto-derivation.
Everything else MUST pass an explicit `eventType`.

> **You do NOT register router eventTypes in `EVENT_AUDIT_MAPPINGS`.**
> `getAuditLogger(...).logAction(...)` is the **direct-write** path:
> `createCrudEntry` stores your `eventType` (and your explicit
> `dataClassification`) on the entry verbatim — it never consults the registry.
> `EVENT_AUDIT_MAPPINGS` (`apps/api/src/security/audit-event-handler.ts`)
> governs a **separate** path — domain events ingested off the event bus by
> `AuditEventHandler`, which maps an `event.eventType` to a classification when
> the emitter didn't supply one. The two paths don't cross. So pick a canonical,
> human-readable `eventType` string and an explicit `dataClassification`; no
> registry edit is required for router instrumentation. (Keep the name
> consistent with any existing registry entry for the same concept — e.g.
> `LeadScored` / `ContactScored` — purely so dashboards group them, not because
> the code needs it.)

---

## 4. Data classification

| Classification | Use for                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIDENTIAL` | Raw PII: contact/lead/account rows, emails, phone, notes, activity, links, exports, bulk ops over PII. **Default for this work.** |
| `INTERNAL`     | Derived/non-PII signals: AI scores, tiers, confidence.                                                                            |
| `RESTRICTED`   | Legal/financial documents (legal module only).                                                                                    |

When in doubt, look at how the same event type is already classified in
`EVENT_AUDIT_MAPPINGS` and match it. `ContactCreated` / `Updated` / `Deleted`
are CONFIDENTIAL; `LeadScored` / `ContactScored` are INTERNAL.

---

## 5. Hard rules that the gates enforce (these caused the IFC-240 rework)

1. **Fire-and-forget, always.** The audit call is a dangling promise with a
   `.catch()` — never `await` it, never let it throw into the request path. If
   the audit DB is down the user's request still succeeds. This is asserted by
   the resilience tests in §6.

2. **No nested ternaries (`no-nested-ternary`).** When you need conditional
   `beforeState` / `afterState` / `eventType`, build it in an `if`-block or a
   helper above the call — do NOT inline `a ? b : c ? d : e`. ESLint blocks it
   and you will burn a round.

3. **SonarJS S2871 — `Array.prototype.sort()` needs a comparator.** If any
   helper you add sorts keys/ids (e.g. to canonicalize a diff), pass an explicit
   comparator. A bare `.sort()` on strings is flagged CRITICAL and drops the
   reliability rating to **D**, failing the SonarCloud gate. Use:

   ```ts
   ids.sort((a, b) => {
     if (a < b) return -1;
     if (a > b) return 1;
     return 0;
   });
   ```

   **NOT** `localeCompare` (locale-dependent — breaks determinism) and **NOT** a
   bare `.sort()`.

4. **Place the call after commit, before return.** Logging before the business
   write means you audit operations that then fail. Logging an UPDATE/DELETE
   needs the `beforeRow` snapshot taken _before_ the write but the `logAction`
   call placed _after_ the write succeeds.

5. **Don't double-log.** A procedure that delegates to a service which itself
   audits, or a path that branches (e.g. `updateEmail`'s auto-merge vs normal
   path), gets exactly one audit call per branch — verify by reading the whole
   procedure, not just the happy path. (Contact `updateEmail` legitimately has
   **two** call sites because it has two terminal branches; that is the only
   procedure in the contact router with >1 site.)

---

## 6. Tests you must add (one file + one static guard)

### 6a. `contact.router.audit-logging.test.ts` (behavioural)

Mock `getAuditLogger` and assert each instrumented procedure fires the right
call. Shape:

```ts
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: vi.fn(),
}));
// in beforeEach, re-wire the spies (setup.ts clears mocks before each test):
//   mockLogAction = vi.fn().mockResolvedValue('audit-id');
//   mockLogBulkOperation = vi.fn().mockResolvedValue('audit-id');
//   vi.mocked(getAuditLogger).mockReturnValue({ logAction, logBulkOperation, logPermissionDenied } as any);
```

- Flush the microtask queue (`await new Promise((r) => setImmediate(r))`) after
  the call, then assert `logAction` / `logBulkOperation` was called with the
  expected `(action, resourceType, id, tenantId, opts)` — check `action`,
  `eventType`, and `dataClassification` at minimum.
- **Two resilience tests:** (1) a rejected audit promise does NOT reject the
  procedure (result still returns); (2) the audit call is not awaited (the
  procedure resolves even when the audit promise rejects).

### 6b. `T-011` static guard in `contact.router.security.test.ts`

A source-reading test that pins **every** raw `ctx.prisma` occurrence in the
router to an explicit allow-list of tenant-safe consumers:

```ts
const routerSource = readFileSync(
  resolve(__dirname, '../contact.router.ts'),
  'utf-8'
);
const allCtxPrisma = (routerSource.match(/ctx\.prisma\b/g) ?? []).length;
const auditLoggerUsages = (
  routerSource.match(/getAuditLogger\(ctx\.prisma\)/g) ?? []
).length;
const userLookupUsages = (
  routerSource.match(/ctx\.prisma\.user\.findMany/g) ?? []
).length;
expect(allCtxPrisma).toBe(auditLoggerUsages + userLookupUsages);
expect(userLookupUsages).toBeLessThanOrEqual(1);
```

Why it matters: audit logging is the reason `ctx.prisma` (the **unscoped**
client) appears in the router at all. The guard asserts the only unscoped uses
are the audit-logger singleton (tenant-safe — it writes an explicit `tenantId`
per entry) plus a single bounded `user.findMany` lookup. If a future edit reads
**business data** through raw `ctx.prisma.contact.*` (bypassing
`prismaWithTenant` and tenant isolation), the count no longer matches and this
test fails. Update the allow-list deliberately if you add a new legitimate
unscoped consumer.

---

## 7. The codex / pre-ship gate reality (so you don't panic)

- **codex-review is local-only and non-deterministic.** On IFC-240 it
  hallucinated a finding that cited code already removed (proven by diffing
  `codex-prompt.txt`, which had the current source, against `codex-raw.txt`,
  which cited the old). The finding was un-waivable because its fingerprint was
  the ubiquitous `getAuditLogger(ctx.prisma)` line that appears 15+ times.
- If codex flags something, **verify it against the actual on-disk source
  first.** If it cites code that isn't there, it is a hallucination — document
  it in the attestation `notes` and, with **owner approval only**, push with
  `--no-verify`. Do not waive it (the fingerprint is too common) and do not
  rewrite correct code to appease it.
- Run codex standalone (`node scripts/codex-review.mjs`) once before the full
  `pre-ship` so you converge it on its own, rather than discovering it at the
  end of a 10-minute pre-ship run.
- `pre-ship` caches PASS by HEAD SHA — a clean re-run after a no-op commit
  reuses the cached green; don't re-burn the full suite to "double-check".

---

## 8. Attestation honesty

Record in the attestation exactly what happened, including any codex
hallucination and any `--no-verify` push (with the approver). The IFC-240
attestation (`.specify/sprints/sprint-18/attestations/IFC-240/attestation.json`)
is the honest template: it states the codex finding was a hallucination, names
the owner who approved the bypass, and lists the 4 validations + the
real-evidence gates. Do not write "all gates green" if you bypassed one — write
what you bypassed and why it was safe.

---

## 9. Procedure-selection checklist

For each procedure in the router, decide:

- **Mutates a row?** → `CREATE` / `UPDATE` / `DELETE` / `AI_SCORE` (or
  `UPDATE` + explicit eventType for domain verbs).
- **Returns one record of PII?** → `READ` with explicit eventType.
- **Operates over many ids?** → `logBulkOperation` with attempted + successful.
- **List / search / count / filter-options?** → **skip** (too noisy).
- **Settings / config read that isn't PII?** → skip unless compliance requires.

IFC-255 result for reference: 18 of contact's 28 procedures instrumented (15
`logAction` + 4 `logBulkOperation` = 19 call sites; `updateEmail` has two sites
for its merge vs normal branches). The 10 skipped are
list/search/count/filter-option/settings reads.
