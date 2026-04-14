/**
 * Seed Help Articles — Unit Tests
 *
 * Covers: idempotent upsert on (tenantId, slug), section delete-then-create,
 * tenant resolution, status=PUBLISHED + publishedAt derivation, post-seed
 * validation, error handling, and $disconnect discipline.
 *
 * @see packages/db/prisma/seed-help-articles.ts (SUT)
 * @see .specify/sprints/sprint-17/planning/IFC-300-plan.md
 *
 * Test injects a fake Prisma client via the SUT's `__setPrismaForTest` hook
 * rather than module-level mocks — this avoids fragile path-matching for
 * `vi.mock('../generated/prisma/client')` which differs by caller location.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SEED_IDS } from '../seed-ids';
import {
  EXPECTED_ARTICLES,
  EXPECTED_SECTIONS,
  __setPrismaForTest,
  __TEST_FIXTURES__ as FIXTURES,
  assertSnapshotShape,
  getPrisma,
  main,
  runAndExit,
} from '../../prisma/seed-help-articles';

const TENANT_ID = SEED_IDS.tenant.default;

function buildFakePrisma() {
  const mockFindUnique = vi.fn();
  const mockCreateTenant = vi.fn();
  const mockUpsert = vi.fn();
  const mockCountArticles = vi.fn();
  const mockDeleteMany = vi.fn();
  const mockCreateSection = vi.fn();
  const mockCountSections = vi.fn();
  const mockDisconnect = vi.fn().mockResolvedValue(undefined);

  const fakePrisma = {
    tenant: {
      findUnique: mockFindUnique,
      create: mockCreateTenant,
    },
    helpArticle: {
      upsert: mockUpsert,
      count: mockCountArticles,
    },
    articleSection: {
      deleteMany: mockDeleteMany,
      create: mockCreateSection,
      count: mockCountSections,
    },
    $disconnect: mockDisconnect,
  } as unknown as Parameters<typeof __setPrismaForTest>[0];

  return {
    fakePrisma,
    mocks: {
      mockFindUnique,
      mockCreateTenant,
      mockUpsert,
      mockCountArticles,
      mockDeleteMany,
      mockCreateSection,
      mockCountSections,
      mockDisconnect,
    },
  };
}

function happyPath(mocks: ReturnType<typeof buildFakePrisma>['mocks']) {
  mocks.mockFindUnique.mockResolvedValue({ id: TENANT_ID, slug: 'default' });
  mocks.mockUpsert.mockImplementation(({ create }: { create: { slug: string } }) =>
    Promise.resolve({ id: `article-${create.slug}`, slug: create.slug, tenantId: TENANT_ID })
  );
  mocks.mockDeleteMany.mockResolvedValue({ count: 0 });
  mocks.mockCreateSection.mockResolvedValue({ id: 'section-id' });
  mocks.mockCountArticles.mockResolvedValue(EXPECTED_ARTICLES);
  mocks.mockCountSections.mockResolvedValue(EXPECTED_SECTIONS);
}

describe('seed-help-articles', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((_code?: number) => undefined) as typeof process.exit);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    __setPrismaForTest(null);
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('T1 — happy path: upserts every article exactly once and syncs sections', async () => {
    const { fakePrisma, mocks } = buildFakePrisma();
    happyPath(mocks);
    __setPrismaForTest(fakePrisma);

    await main();

    expect(mocks.mockUpsert).toHaveBeenCalledTimes(EXPECTED_ARTICLES);
    expect(mocks.mockDeleteMany).toHaveBeenCalledTimes(EXPECTED_ARTICLES);
    expect(mocks.mockCreateSection).toHaveBeenCalledTimes(EXPECTED_SECTIONS);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('T2 — idempotent re-run: second call produces identical upsert/section counts', async () => {
    const { fakePrisma, mocks } = buildFakePrisma();
    happyPath(mocks);
    __setPrismaForTest(fakePrisma);

    await main();
    const firstUpserts = mocks.mockUpsert.mock.calls.length;
    const firstDeletes = mocks.mockDeleteMany.mock.calls.length;
    const firstCreates = mocks.mockCreateSection.mock.calls.length;

    await main();
    expect(mocks.mockUpsert.mock.calls.length).toBe(firstUpserts * 2);
    expect(mocks.mockDeleteMany.mock.calls.length).toBe(firstDeletes * 2);
    expect(mocks.mockCreateSection.mock.calls.length).toBe(firstCreates * 2);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('T3 — tenant resolution: findUnique uses SEED_IDS.tenant.default; creates when missing', async () => {
    const { fakePrisma, mocks } = buildFakePrisma();
    mocks.mockFindUnique.mockResolvedValue(null);
    mocks.mockCreateTenant.mockResolvedValue({ id: TENANT_ID, slug: 'default' });
    mocks.mockUpsert.mockResolvedValue({ id: 'article-1', slug: 'x', tenantId: TENANT_ID });
    mocks.mockDeleteMany.mockResolvedValue({ count: 0 });
    mocks.mockCreateSection.mockResolvedValue({ id: 's' });
    mocks.mockCountArticles.mockResolvedValue(EXPECTED_ARTICLES);
    mocks.mockCountSections.mockResolvedValue(EXPECTED_SECTIONS);
    __setPrismaForTest(fakePrisma);

    await main();

    expect(mocks.mockFindUnique).toHaveBeenCalledWith({ where: { id: TENANT_ID } });
    expect(mocks.mockCreateTenant).toHaveBeenCalledTimes(1);
    const createArg = mocks.mockCreateTenant.mock.calls[0][0] as { data: { id: string } };
    expect(createArg.data.id).toBe(TENANT_ID);
  });

  it('T4 — each upsert sets status=PUBLISHED and publishedAt derived from lastUpdatedAt', async () => {
    const { fakePrisma, mocks } = buildFakePrisma();
    happyPath(mocks);
    __setPrismaForTest(fakePrisma);

    await main();

    expect(mocks.mockUpsert).toHaveBeenCalledTimes(EXPECTED_ARTICLES);
    for (let i = 0; i < mocks.mockUpsert.mock.calls.length; i++) {
      const call = mocks.mockUpsert.mock.calls[i][0] as {
        where: { tenantId_slug: { tenantId: string; slug: string } };
        create: { status: string; publishedAt: Date; tenantId: string };
        update: { status: string; publishedAt: Date };
      };
      expect(call.where.tenantId_slug.tenantId).toBe(TENANT_ID);
      expect(call.create.status).toBe('PUBLISHED');
      expect(call.update.status).toBe('PUBLISHED');
      expect(call.create.publishedAt).toBeInstanceOf(Date);
      expect(Number.isNaN(call.create.publishedAt.getTime())).toBe(false);
      expect(call.create.tenantId).toBe(TENANT_ID);
    }
  });

  it('T5 — section delete-before-create ordering per article', async () => {
    const { fakePrisma, mocks } = buildFakePrisma();
    happyPath(mocks);
    const orderLog: string[] = [];
    mocks.mockUpsert.mockImplementation(({ create }: { create: { slug: string } }) => {
      orderLog.push(`upsert:${create.slug}`);
      return Promise.resolve({
        id: `article-${create.slug}`,
        slug: create.slug,
        tenantId: TENANT_ID,
      });
    });
    mocks.mockDeleteMany.mockImplementation(({ where }: { where: { articleId: string } }) => {
      orderLog.push(`deleteMany:${where.articleId}`);
      return Promise.resolve({ count: 0 });
    });
    mocks.mockCreateSection.mockImplementation(({ data }: { data: { articleId: string } }) => {
      orderLog.push(`createSection:${data.articleId}`);
      return Promise.resolve({ id: 'section-id' });
    });
    __setPrismaForTest(fakePrisma);

    await main();

    for (const slug of FIXTURES.allSlugs) {
      const upsertIdx = orderLog.indexOf(`upsert:${slug}`);
      const articleId = `article-${slug}`;
      const deleteIdx = orderLog.indexOf(`deleteMany:${articleId}`);
      const firstCreateIdx = orderLog.indexOf(`createSection:${articleId}`);
      expect(upsertIdx).toBeGreaterThanOrEqual(0);
      expect(deleteIdx).toBeGreaterThan(upsertIdx);
      const expectedSections = FIXTURES.sectionCounts.get(slug) ?? 0;
      if (expectedSections > 0) {
        expect(firstCreateIdx).toBeGreaterThan(deleteIdx);
      }
    }
  });

  it('T6 — keywords and relatedArticleIds are passed through as JSON arrays unchanged', async () => {
    const { fakePrisma, mocks } = buildFakePrisma();
    happyPath(mocks);
    __setPrismaForTest(fakePrisma);

    await main();

    const firstCall = mocks.mockUpsert.mock.calls.find(
      (c) =>
        (c[0] as { where: { tenantId_slug: { slug: string } } }).where.tenantId_slug.slug ===
        FIXTURES.firstSlug
    );
    expect(firstCall).toBeDefined();
    const payload = firstCall![0] as {
      create: { keywords: readonly string[]; relatedArticleIds: readonly string[] };
    };
    expect(payload.create.keywords).toEqual(FIXTURES.firstKeywords);
    expect(payload.create.relatedArticleIds).toEqual(FIXTURES.firstRelatedIds);
  });

  it('T7 — validation mismatch logs error and calls process.exit(1)', async () => {
    const { fakePrisma, mocks } = buildFakePrisma();
    happyPath(mocks);
    mocks.mockCountArticles.mockResolvedValueOnce(EXPECTED_ARTICLES - 1);
    __setPrismaForTest(fakePrisma);

    await main();

    expect(errorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('T8 — error in upsert triggers process.exit(1) via runAndExit', async () => {
    const { fakePrisma, mocks } = buildFakePrisma();
    mocks.mockFindUnique.mockResolvedValue({ id: TENANT_ID, slug: 'default' });
    mocks.mockUpsert.mockRejectedValue(new Error('db down'));
    __setPrismaForTest(fakePrisma);

    await runAndExit();

    expect(errorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.mockDisconnect).toHaveBeenCalled();
  });

  it('T9b — getPrisma returns the injected mock without constructing a real client', () => {
    const { fakePrisma } = buildFakePrisma();
    __setPrismaForTest(fakePrisma);
    expect(getPrisma()).toBe(fakePrisma);
  });

  it('T9c — getPrisma constructs a real client when nothing is injected', () => {
    __setPrismaForTest(null);
    process.env.DATABASE_URL = 'postgres://test@localhost/test';
    // Exercises the lazy-init branch: without an injected mock, getPrisma
    // constructs PrismaPg + PrismaClient on first call and caches them.
    const client = getPrisma();
    expect(client).toBeDefined();
    expect(getPrisma()).toBe(client); // cached
    __setPrismaForTest(null); // reset cache for later tests
  });

  it('T10 — assertSnapshotShape rejects malformed inputs', () => {
    expect(() => assertSnapshotShape(null)).toThrow(/missing "articles"/);
    expect(() => assertSnapshotShape({})).toThrow(/missing "articles"/);
    expect(() => assertSnapshotShape({ articles: [] })).toThrow(/non-empty array/);
    expect(() => assertSnapshotShape({ articles: 'not-an-array' })).toThrow(/non-empty array/);
    expect(() => assertSnapshotShape({ articles: [null] })).toThrow(/each article must be an object/);
    expect(() => assertSnapshotShape({ articles: [{ slug: 'x' }] })).toThrow(/required fields/);
  });

  it('T11 — __setPrismaForTest throws in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => __setPrismaForTest(null)).toThrow(/not callable in production/);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('T9 — $disconnect runs on both success and failure paths', async () => {
    const { fakePrisma, mocks } = buildFakePrisma();
    happyPath(mocks);
    __setPrismaForTest(fakePrisma);

    await runAndExit();
    expect(mocks.mockDisconnect).toHaveBeenCalledTimes(1);

    mocks.mockUpsert.mockRejectedValueOnce(new Error('explode'));
    await runAndExit();
    expect(mocks.mockDisconnect).toHaveBeenCalledTimes(2);
  });
});
