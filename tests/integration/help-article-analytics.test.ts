/**
 * Help Article Analytics — real-Database integration test (IFC-304 PR A).
 *
 * Lives in `tests/integration/` so it actually runs in the CI "Integration
 * Tests" lane + pre-ship (`pnpm run test:integration`, the `integration` vitest
 * project). An equivalent file under `apps/api/**` would be excluded from every
 * gate and verify nothing.
 *
 * Exercises PrismaHelpArticleAnalyticsRepository against the real test DB:
 * atomic increment, genuine transaction-rollback idempotency, two-tenant
 * isolation, PII-redacted term storage, and batched retention purge. The test
 * DB connects as `postgres` (BYPASSRLS) so isolation here is proven by the
 * repository's explicit `tenantId` filtering — the primary app-level guarantee;
 * DB-level RLS is exercised separately by `rls-tenant-isolation.test.ts`.
 *
 * Skips cleanly when DATABASE_URL is not set.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
// Relative source imports: the top-level `resolve.alias` is not inherited by the
// `integration` vitest project, so `@intelliflow/*` package names don't resolve
// here (see the other tests/integration files, which do the same).
import { PrismaHelpArticleAnalyticsRepository } from '../../packages/adapters/src/repositories/PrismaHelpArticleAnalyticsRepository';
import {
  dedupExpiry,
  ANALYTICS_RETENTION_DAYS,
} from '../../packages/domain/src/support/help-article-analytics';
import { PrismaClient } from '../../packages/db/generated/prisma/client';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('⏭️  Skipping help-article-analytics integration test: DATABASE_URL not set');
}

// Unique per-run ids so leftovers never collide and cleanup is precise.
const RUN = `ifc304_${Date.now()}`;
const TENANT_A = `${RUN}_a`;
const TENANT_B = `${RUN}_b`;
const ARTICLE_A = `${RUN}_art_a`;
const ARTICLE_B = `${RUN}_art_b`;
const OCCURRED = new Date('2026-07-20T12:00:00Z');

describeDb('HelpArticleAnalytics integration (real DB)', () => {
  let prisma: any;
  let repo: PrismaHelpArticleAnalyticsRepository;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    repo = new PrismaHelpArticleAnalyticsRepository(prisma);

    for (const [id, slug] of [
      [TENANT_A, `${RUN}-a`],
      [TENANT_B, `${RUN}-b`],
    ]) {
      await prisma.tenant.upsert({
        where: { id },
        create: { id, name: id, slug },
        update: {},
      });
    }

    const mkArticle = (id: string, tenantId: string, slug: string) =>
      prisma.helpArticle.upsert({
        where: { id },
        create: {
          id,
          tenantId,
          slug,
          title: 'IFC-304 fixture',
          categoryId: 'ifc304',
          excerpt: 'fixture',
          readTimeMinutes: 1,
        },
        update: {},
      });
    await mkArticle(ARTICLE_A, TENANT_A, `${RUN}-art-a`);
    await mkArticle(ARTICLE_B, TENANT_B, `${RUN}-art-b`);
  });

  afterAll(async () => {
    if (!prisma) return;
    // Cascades remove analytics rows tied to these articles/tenants.
    await prisma.helpArticle.deleteMany({ where: { id: { in: [ARTICLE_A, ARTICLE_B] } } });
    await prisma.helpArticleSearchNoResultDaily.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.helpArticleAnalyticsDedup.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
    await prisma.$disconnect();
  });

  it('atomically increments the view aggregate', async () => {
    await repo.recordArticleView({
      tenantId: TENANT_A,
      articleId: ARTICLE_A,
      occurredAt: OCCURRED,
    });
    await repo.recordArticleView({
      tenantId: TENANT_A,
      articleId: ARTICLE_A,
      occurredAt: OCCURRED,
    });
    expect(await repo.getArticleViewTotal(TENANT_A, ARTICLE_A)).toBe(2);
  });

  it('is idempotent per key (the retry transaction rolls back)', async () => {
    const before = await repo.getArticleViewTotal(TENANT_A, ARTICLE_A);
    const first = await repo.recordArticleView({
      tenantId: TENANT_A,
      articleId: ARTICLE_A,
      occurredAt: OCCURRED,
      idempotencyKey: 'dup-key-1',
    });
    const second = await repo.recordArticleView({
      tenantId: TENANT_A,
      articleId: ARTICLE_A,
      occurredAt: OCCURRED,
      idempotencyKey: 'dup-key-1',
    });
    expect(first).toEqual({ recorded: true, deduped: false });
    expect(second).toEqual({ recorded: false, deduped: true });
    expect(await repo.getArticleViewTotal(TENANT_A, ARTICLE_A)).toBe(before + 1);
  });

  it('isolates aggregates across tenants', async () => {
    await repo.recordArticleView({
      tenantId: TENANT_B,
      articleId: ARTICLE_B,
      occurredAt: OCCURRED,
    });
    expect(await repo.getArticleViewTotal(TENANT_A, ARTICLE_B)).toBe(0);
    expect(await repo.getArticleViewTotal(TENANT_B, ARTICLE_A)).toBe(0);
    expect(await repo.getArticleViewTotal(TENANT_B, ARTICLE_B)).toBe(1);
  });

  it('records a no-result search term and isolates it per tenant', async () => {
    await repo.recordSearchNoResult({
      tenantId: TENANT_A,
      normalizedTerm: 'ifc304 refund [redacted]',
      occurredAt: OCCURRED,
    });
    expect(await repo.getSearchNoResultTotal(TENANT_A, 'ifc304 refund [redacted]')).toBe(1);
    expect(await repo.getSearchNoResultTotal(TENANT_B, 'ifc304 refund [redacted]')).toBe(0);
  });

  it('purges expired dedup guards and out-of-retention aggregates', async () => {
    const now = new Date('2026-07-26T00:00:00Z');

    await prisma.helpArticleAnalyticsDedup.create({
      data: {
        tenantId: TENANT_A,
        idempotencyKey: `${RUN}-expired`,
        expiresAt: new Date(now.getTime() - 60_000),
      },
    });
    const stale = new Date(
      Date.UTC(2026, 6, 26) - (ANALYTICS_RETENTION_DAYS + 5) * 24 * 60 * 60 * 1000
    );
    await prisma.helpArticleSearchNoResultDaily.create({
      data: { tenantId: TENANT_A, normalizedTerm: `${RUN}-stale`, day: stale, searchCount: 1 },
    });
    await prisma.helpArticleAnalyticsDedup.create({
      data: { tenantId: TENANT_A, idempotencyKey: `${RUN}-fresh`, expiresAt: dedupExpiry(now) },
    });

    const result = await repo.purgeExpired(now, 100);

    expect(result.dedupPurged).toBeGreaterThanOrEqual(1);
    expect(result.searchNoResultPurged).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.helpArticleAnalyticsDedup.findFirst({
        where: { tenantId: TENANT_A, idempotencyKey: `${RUN}-expired` },
      })
    ).toBeNull();
    expect(
      await prisma.helpArticleAnalyticsDedup.findFirst({
        where: { tenantId: TENANT_A, idempotencyKey: `${RUN}-fresh` },
      })
    ).not.toBeNull();
  });
});
