/**
 * Help Article Router — analytics instrumentation tests (IFC-304 PR A).
 *
 * Covers the write-side `recordView` / `recordSearchNoResult` mutations:
 * tenant-scoped guarding, PII redaction, empty-term short-circuit, and the
 * cross-tenant negative path. Real-DB behaviour is covered by the adapter
 * integration test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { helpArticleRouter } from '../help-article.router';
import { prismaMock, createTestContext, TEST_UUIDS, generateTestUUID } from '../../../test/setup';

// Return the same prismaMock instead of a real Prisma extension.
vi.mock('../../../security/tenant-context', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createTenantScopedPrisma: vi.fn((prisma: unknown) => prisma),
  };
});

const ARTICLE_ID = generateTestUUID('analytics-article-1');

/** Make `$transaction(cb)` execute the callback against the same mock. */
function armTransaction() {
  (
    prismaMock.$transaction as unknown as { mockImplementation: (f: unknown) => void }
  ).mockImplementation((fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
}

describe('helpArticleRouter.recordView (IFC-304)', () => {
  beforeEach(() => armTransaction());

  it('records a view for an article in the caller tenant', async () => {
    (prismaMock.helpArticle.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: ARTICLE_ID,
    });

    const caller = helpArticleRouter.createCaller(createTestContext());
    const result = await caller.recordView({ articleId: ARTICLE_ID });

    expect(result).toEqual({ recorded: true, deduped: false });
    expect(prismaMock.helpArticleViewDaily.upsert).toHaveBeenCalledTimes(1);
    const arg = (prismaMock.helpArticleViewDaily.upsert as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(arg.where.tenantId_articleId_day.tenantId).toBe(TEST_UUIDS.tenant);
    expect(arg.where.tenantId_articleId_day.articleId).toBe(ARTICLE_ID);
  });

  it('rejects (NOT_FOUND) an article that is not in the caller tenant — cross-tenant guard', async () => {
    // findFirst is tenant-scoped; a foreign article resolves to null.
    (prismaMock.helpArticle.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const caller = helpArticleRouter.createCaller(createTestContext());
    await expect(caller.recordView({ articleId: 'foreign-article' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(prismaMock.helpArticleViewDaily.upsert).not.toHaveBeenCalled();
  });

  it('passes an idempotency key through to the dedup guard', async () => {
    (prismaMock.helpArticle.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: ARTICLE_ID,
    });

    const caller = helpArticleRouter.createCaller(createTestContext());
    await caller.recordView({ articleId: ARTICLE_ID, idempotencyKey: 'nonce-1' });

    expect(prismaMock.helpArticleAnalyticsDedup.create).toHaveBeenCalledTimes(1);
    const arg = (prismaMock.helpArticleAnalyticsDedup.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(arg.data.idempotencyKey).toBe('view:nonce-1');
    expect(arg.data.tenantId).toBe(TEST_UUIDS.tenant);
  });
});

describe('helpArticleRouter.recordSearchNoResult (IFC-304)', () => {
  beforeEach(() => armTransaction());

  it('records a normalized no-result search term', async () => {
    const caller = helpArticleRouter.createCaller(createTestContext());
    const result = await caller.recordSearchNoResult({ term: '  Reset   Password  ' });

    expect(result).toEqual({ recorded: true, deduped: false });
    const arg = (prismaMock.helpArticleSearchNoResultDaily.upsert as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(arg.where.tenantId_normalizedTerm_day.normalizedTerm).toBe('reset password');
    expect(arg.where.tenantId_normalizedTerm_day.tenantId).toBe(TEST_UUIDS.tenant);
  });

  it('redacts PII (email) from the stored term', async () => {
    const caller = helpArticleRouter.createCaller(createTestContext());
    await caller.recordSearchNoResult({ term: 'refund for jane.doe@example.com' });

    const arg = (prismaMock.helpArticleSearchNoResultDaily.upsert as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    const stored = arg.where.tenantId_normalizedTerm_day.normalizedTerm as string;
    expect(stored).not.toContain('jane.doe@example.com');
    expect(stored).toContain('[redacted]');
  });

  it('silently ignores a term that normalizes to empty', async () => {
    const caller = helpArticleRouter.createCaller(createTestContext());
    const result = await caller.recordSearchNoResult({ term: '   ' });

    expect(result).toEqual({ recorded: false, deduped: false });
    expect(prismaMock.helpArticleSearchNoResultDaily.upsert).not.toHaveBeenCalled();
  });
});
