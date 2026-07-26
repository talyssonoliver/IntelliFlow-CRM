# IFC-304 PR A — Article Analytics Foundation & Instrumentation

**Task:** IFC-304 "Article Analytics Dashboard" (Sprint 19, Support module).
**Deps:** IFC-303 (article feedback), PG-180 — both Completed. **Scope split:**
This is **PR A** (write-side foundation). The read-side
`helpArticle.getAnalytics` procedure + the `article-analytics.tsx` admin
dashboard ship in **PR B**, which consumes the tables introduced here.

## Problem

The Article Analytics Dashboard (IFC-304 acceptance criteria) must show article
**views**, feedback stats, most/least helpful articles, and **search terms with
no results**. Feedback data already exists (`ArticleFeedback`, IFC-303), but
there is **no data source** for views or no-result searches — nothing in the
codebase records either. Recon confirmed the help-article router (`IFC-299`)
does direct `prismaWithTenant` reads with no view counter, and search is a
client-side filter that never records a "no results" event.

Per Product Owner decision (2026-07-26, Option 2), these missing data sources
are **implementation dependencies**, not a scope reduction: we build them.

## Design — privacy-preserving daily aggregates

We deliberately **do not** retain any user/session identity and **do not** use a
race-prone naked `viewCount` column on `HelpArticle`. Instead we add
append/increment **daily aggregate** tables, mirroring the repo's rollup
convention (`GrowthMetric`/`DealsWonMetric` shapes) and the atomic-increment
idiom (`{ increment: 1 }` under `upsert`, as in `LeadRoutingService`).

### New models (all additive, backward-compatible, non-destructive)

| Model                            | Purpose                       | Natural key                       | Counter       |
| -------------------------------- | ----------------------------- | --------------------------------- | ------------- |
| `HelpArticleViewDaily`           | per-article view rollup       | `(tenantId, articleId, day)`      | `viewCount`   |
| `HelpArticleSearchNoResultDaily` | per-term no-result rollup     | `(tenantId, normalizedTerm, day)` | `searchCount` |
| `HelpArticleAnalyticsDedup`      | short-lived idempotency guard | `(tenantId, idempotencyKey)`      | — (TTL row)   |

- `day` is a UTC date-only bucket (`@db.Date`), computed server-side.
- `normalizedTerm` is **never** the raw user input: it is trimmed,
  whitespace-collapsed, lowercased, **PII-redacted** (email / phone / long digit
  runs → `[redacted]`), and length-limited to 120 chars. No identity is stored.
- All three carry `tenantId` + a cascading `tenant` relation and are indexed on
  `tenantId` (plus `(tenantId, day)` for the read-side range queries PR B
  needs).

### Atomic + idempotent writes

Each record operation runs in a single `$transaction`:

1. If the caller supplies an opaque `idempotencyKey` (e.g. a per-render nonce),
   the adapter inserts a namespaced (`view:` / `search:`) row into
   `HelpArticleAnalyticsDedup`. A unique-constraint violation (`P2002`) means
   the event was already counted → the write short-circuits (`deduped: true`)
   and the counter is **not** incremented.
2. The aggregate is incremented via `upsert` with `{ increment: 1 }` — a single
   DB-side atomic operation, no read-modify-write race.

When no key is supplied, counting is at-least-once by design (the privacy-driven
tradeoff of retaining no session identity). This is documented and intentional.

### Tenant isolation (defense-in-depth)

- **Primary guarantee (app layer):** every repository method filters by an
  explicit `tenantId`; the router resolves it from `ctx.tenant.tenantId` and
  additionally verifies the target article belongs to the tenant before counting
  a view.
- **Secondary guarantee (DB layer):** each new table gets
  `ENABLE ROW LEVEL SECURITY` + an explicit `tenant_isolation` `USING` policy
  keyed on `app.current_tenant_id`, following the current best-practice
  convention (`report_templates`, `20260629000001`). The write path uses
  `ctx.prismaWithTenant`, which sets that GUC, so RLS is satisfied in every
  deployment role.

Cross-tenant negative tests assert both layers.

### Retention / purge (consistent with existing telemetry)

`purgeExpiredRecords` (`retention-purge.service.ts`) is extended to also purge:

- `HelpArticleAnalyticsDedup` rows past `expiresAt` (TTL 48h — long enough to
  absorb client retries, short enough to hold no lasting data),
- `HelpArticleViewDaily` / `HelpArticleSearchNoResultDaily` rows older than the
  `ANALYTICS_RETENTION_DAYS` (400d) window,

using the same batched `deleteMany` pattern already used for `AuditLogEntry`.

## Ports / adapters / tRPC

- **Port:** `HelpArticleAnalyticsRepository` (`@intelliflow/application`).
- **Adapter:** `PrismaHelpArticleAnalyticsRepository` (`@intelliflow/adapters`),
  constructed per-request over `ctx.prismaWithTenant`.
- **tRPC:** two `tenantProcedure` mutations on `helpArticle` —
  `recordView({ articleId, idempotencyKey? })` and
  `recordSearchNoResult({ term, idempotencyKey? })`.

## Feature enablement / rollback

The change is **backward-compatible**: existing reads/writes are untouched; the
new procedures are additive. The feature can be disabled purely at the call site
(client stops calling the mutations, or a flag gates the calls) **without
reverting the schema** — empty tables are harmless.

## DB Class A gate evidence

| Gate                                      | Status                                                                                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration SQL reviewed independently      | code-review agent (see attestation)                                                                                                                                          |
| Expand/contract compatibility             | Expand-only: 3 new tables, no column changes to existing tables, no data rewrite                                                                                             |
| Local + real-DB integration tests pass    | `*.integration.test.ts` @ `localhost:5433`                                                                                                                                   |
| Tenant isolation / authz tests pass       | cross-tenant negatives (unit + integration)                                                                                                                                  |
| Lock / query-plan / perf risk             | `CREATE TABLE` + `CREATE INDEX` on brand-new empty tables → no lock on existing tables, no backfill                                                                          |
| Snapshot / forward-recovery plan          | Additive only. Forward recovery = re-run migration (idempotent DDL guarded by Prisma migration ledger). Rollback = `DROP TABLE` the 3 new tables; no existing data affected. |
| Feature disabled without reverting schema | Yes — stop calling the mutations; empty tables are inert                                                                                                                     |
| Production migration path                 | `prisma migrate deploy` (never `db push` / `db reset` / `migrate dev`)                                                                                                       |
| Post-migration schema + smoke verify      | `prisma migrate status` + `recordView`/`recordSearchNoResult` smoke                                                                                                          |

Classification: **Class A — autonomous through production** (additive,
backward-compatible, non-destructive), matching the Product Owner's expectation.
