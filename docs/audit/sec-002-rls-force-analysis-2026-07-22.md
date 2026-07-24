# SEC-002 — RLS Owner-Bypass (`FORCE ROW LEVEL SECURITY`) — Verified Analysis & Phased Remediation

**Finding:** SEC-002 (High, `rls-owner-bypass`) — ENG-OPS-002 Sprint-19 security
audit **Status:** ⛔ **Naive remediation rejected — would break production.**
Root fix re-scoped as a tracked, phased effort (see below). **Date:** 2026-07-22
**Wave:** A (security batch). This document is the SEC-002 deliverable for the
Wave-A PR; **no `FORCE` migration ships in this PR.**

---

## 1. The finding is observationally correct

The baseline migration enables RLS on 69 tenant-scoped tables but **never**
pairs any with `FORCE`:

```
grep -c "ENABLE ROW LEVEL SECURITY" packages/db/prisma/migrations/20260317000000_baseline/migration.sql  → 69
grep -c "FORCE ROW LEVEL SECURITY"  packages/db/prisma/migrations/20260317000000_baseline/migration.sql  → 0
grep -rc "FORCE ROW LEVEL SECURITY" packages/db/prisma/migrations/*/migration.sql                        → 0 (every file)
```

Per PostgreSQL semantics, a table's **owner role is exempt from that table's RLS
policies unless `FORCE ROW LEVEL SECURITY` is also set.** Because this codebase
connects Prisma with a single `DATABASE_URL` role used for **both** migrations
and application query traffic (`packages/db/src/client.ts`), that role is (in
the standard setup) the table owner and is therefore exempt. **Today, RLS
provides effectively zero database-level tenant isolation** — the real control
is the application-layer `tenantId` `WHERE` filters (the subject of SEC-001, now
fixed on main in #602).

So far the finding is right, and this is a genuine defense-in-depth gap versus
ADR-004 / ADR-009 (which advertise RLS as a backstop "even if application code
has bugs").

## 2. Why the naive fix (`ALTER TABLE … FORCE ROW LEVEL SECURITY` on all 69 tables) breaks production

The RLS policy on every tenant table is:

```sql
CREATE POLICY tenant_isolation_<t> ON "<t>" FOR ALL USING ("tenantId" = get_current_tenant_id());

CREATE OR REPLACE FUNCTION get_current_tenant_id() RETURNS TEXT AS $$
BEGIN RETURN current_setting('app.current_tenant_id', true); END;   -- note: missing_ok = true
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

`current_setting('app.current_tenant_id', true)` returns **NULL** when the
session variable is not set (the `true` = `missing_ok`). In SQL,
`"tenantId" = NULL` is **NULL (not TRUE)**, so under `FORCE` **a connection that
has not set `app.current_tenant_id` sees zero rows on every one of these 69
tables.**

The application has **two** Prisma clients:

| Client                                                                                                 | Sets `app.current_tenant_id`?                                                       | Behavior under `FORCE` if var unset                                |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `ctx.prismaWithTenant` (`createTenantScopedPrisma`, `apps/api/src/security/tenant-context.ts:154-170`) | Yes — emits `SET app.current_tenant_id = '<id>'` on the first query of each request | OK **if** the SET lands on the same pooled connection as the query |
| `ctx.prisma` (raw base client)                                                                         | **No**                                                                              | **Zero rows** — breakage                                           |

The raw `ctx.prisma` client is used pervasively for legitimate work that has no
session variable set:

- `enrichTenantContext(ctx.prisma, …)` runs on **every** authenticated request
  before any tenant-scoped client exists (`tenant-context.ts:242`).
- **≥16** raw-client tenant-model query sites in `apps/api/src` alone
  (`grep "ctx.prisma.(contact|lead|account|opportunity|task|appointment|auditLog|deal)"`,
  excluding tests), e.g.
  `apps/api/src/modules/inbound/inbound.router.ts:223,249,290,333,496`.
- Provisioning, auth-by-tenant lookups, background workers, and the audit
  hash-chain writer additionally touch these tables outside a `prismaWithTenant`
  scope.

Under `FORCE`, **all of the above immediately return zero rows / fail closed** →
authenticated requests break, inbound lead ingestion breaks, audit writes break.
This is precisely the "script that surely will break everything" outcome.

### Secondary hazard: pooling + session `SET`

`createTenantScopedPrisma` intentionally uses session-scoped `SET` (not
`SET LOCAL`) and emits it once per request to avoid a per-query SET storm. Its
own docstring (`tenant-context.ts:110-117`) acknowledges that if a later query
in the request checks out a **different** pooled connection, the `SET` is not
re-issued. Today that is a soft risk (app-layer `tenantId` filter still
protects). **Under `FORCE` it becomes a hard failure** (zero rows or — worse —
the previous connection's tenant value). Any environment running PgBouncer in
**transaction** mode (rather than the assumed session mode) would break
`prismaWithTenant` too.

## 3. Confidence / false-positive reconciliation

The audit self-rated SEC-002 `confidence: 65`, `possibleFalsePositive: true`,
and its own remediation says to **verify the live Postgres role/ownership
first** and notes "if the deployment already uses a distinct non-owner role for
`DATABASE_URL`, this finding does not apply." That verification requires live DB
access to the deployed Supabase project (`SELECT tableowner FROM pg_tables …` vs
the connection's `current_user`) and was **not** performed in this headless
session. The finding is therefore an architectural inference, not a confirmed
live exploit — and even if confirmed, §2 shows the fix is not a one-line
migration.

## 4. Correct, safe remediation — phased (tracked follow-up, NOT this PR)

`FORCE` is the right end state, but only after the app can guarantee the session
variable (or a non-owner role) on **every** tenant-scoped read/write:

1. **Verify environment reality (prereq, needs DB access).** For each env,
   capture `current_user`, `SELECT tableowner …`, and whether PgBouncer is
   session or transaction mode. If `DATABASE_URL` is already a non-owner role,
   RLS is _partially_ live today and the migration path differs — re-triage
   before any change.
2. **Make tenant context universal.** Migrate every raw `ctx.prisma`
   tenant-scoped query to `ctx.prismaWithTenant` (or otherwise guarantee
   `app.current_tenant_id` is set on the connection), and provide explicit,
   audited cross-tenant/system escape hatches (e.g. a `SECURITY DEFINER` RPC or
   a separately-scoped admin client) for the legitimately-global operations
   (provisioning, `enrichTenantContext`, audit chain). Add an
   ESLint/Prisma-extension guard that fails the build on a raw-client
   tenant-model query.
3. **Fix connection stickiness.** Either move the `SET` into an explicit
   transaction per request (`SET LOCAL`) or pin the connection, so the variable
   cannot desync under pooling. Load-test for the SET-storm regression the
   current design was avoiding.
4. **Flip `FORCE` behind an integration test.** Only then add
   `ALTER TABLE … FORCE ROW LEVEL SECURITY` for the tenant tables, with an
   integration test that connects **as the real application role** and asserts
   (a) a query with no `app.current_tenant_id` returns zero rows across tenants,
   and (b) every normal app flow still works. Consider a dedicated non-owner
   application role as the more robust alternative to `FORCE`.

Estimated effort: multi-task (audit original estimate 240m covered only step 4's
mechanics; steps 1-3 dominate). This maps to the ENG-OPS-002 remediation backlog
rather than the Wave-A quick-win batch.

## 5. Decision

- **This PR:** ship SEC-003, SEC-004, QUAL-015 (all confirmed, non-breaking).
  SEC-002 ships as this analysis only.
- **Follow-up:** the phased plan in §4, gated on step-1 DB-role verification
  with the owner. Until then the operative tenant control remains the
  application-layer `tenantId` filter (SEC-001 hardened it; the recommended
  repo-wide raw-client-query audit from SEC-001 is the highest-value next step
  and directly de-risks the current no-RLS-backstop reality).

_Evidence gathered read-only from
`packages/db/prisma/migrations/20260317000000_baseline/migration.sql`,
`apps/api/src/security/tenant-context.ts`, `packages/db/src/client.ts`, and
repo-wide grep on 2026-07-22. No live database was inspected._
