-- #533: built-in help articles are tenant-scoped, so non-default tenants get
-- no help content while tenant-authored articles correctly stay isolated.
--
-- Adds `isSystem` to distinguish a built-in article (maintained centrally,
-- readable by every tenant) from a tenant-authored one (stays isolated to its
-- own tenantId, unchanged). The application layer (apps/api/src/modules/
-- help-article/help-article.router.ts) is what enforces the new read rule —
-- `tenantId = caller OR isSystem = true` on every tenant-facing read — this
-- migration only adds the column the router needs to express it.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * help_articles: one NOT NULL column with a DEFAULT -> metadata-only on
--     PG 11+, no table rewrite, no backfill, no existing row changes (every
--     existing row keeps isSystem = false, i.e. stays tenant-authored).
--   * One new index, inside the migration transaction. help_articles has no
--     concurrent writers outside the tenant-scoped router above, so the brief
--     SHARE lock is acceptable (same discipline as prior migrations on this
--     table, e.g. 20260726120000_help_article_analytics).
--
-- Marking the already-seeded built-in articles (owned by the default tenant)
-- as isSystem = true is NOT done here as a raw backfill: it is the job of the
-- existing, idempotent `pnpm --filter @intelliflow/db db:seed:help-articles`
-- (packages/db/prisma/seed-help-articles.ts, updated alongside this
-- migration to set isSystem: true on every row it upserts). Re-running that
-- seed after this migration lands is what flips the canonical built-in slugs
-- to isSystem = true in each environment — the normal, already-documented way
-- this content is deployed, not a one-off data migration.
--
-- Recovery plan: forward-only. Operational rollback = none needed (additive,
-- defaults to the pre-migration isolation behaviour). A down-migration (DROP
-- COLUMN) is Class C — human-only, never run autonomously.
--
-- Production applies only through the gated `prisma migrate deploy` workflow.

ALTER TABLE "help_articles" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "help_articles_isSystem_idx" ON "help_articles"("isSystem");
