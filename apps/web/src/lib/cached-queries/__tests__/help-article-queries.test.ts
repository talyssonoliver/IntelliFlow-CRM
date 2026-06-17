/**
 * Tests for help-article-queries.ts
 *
 * Verifies that:
 * fetchHelpArticlesFirstPage:
 * - Calls cacheLife with LIST_PAGE ("minutes") profile
 * - Calls cacheTag with HELP_ARTICLES_LIST ("help-articles:list") tag
 * - Delegates to caller.helpArticle.list.query() with correct default args
 *   (page 1, limit 20, orderBy "order", orderDir "asc")
 * - Returns the tRPC response unchanged
 * - Works with a null token (unauthenticated path)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Stub transitive deps of trpc-server.ts that Vite transform resolves ──────
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

// ── Mock next/cache ──────────────────────────────────────────────────────────
const mockCacheLife = vi.fn();
const mockCacheTag = vi.fn();
vi.mock('next/cache', () => ({
  cacheLife: (...args: unknown[]) => mockCacheLife(...args),
  cacheTag: (...args: unknown[]) => mockCacheTag(...args),
}));

// ── Mock trpc-server ─────────────────────────────────────────────────────────
const mockHelpArticleList = vi.fn();
const mockCreateCallerFromToken = vi.fn();
vi.mock('@/lib/trpc-server', () => ({
  createCallerFromToken: (...args: unknown[]) => mockCreateCallerFromToken(...args),
}));

import { fetchHelpArticlesFirstPage } from '../help-article-queries';

const SAMPLE_HELP_ARTICLES_PAGE = {
  data: [
    { id: 'article-1', title: 'Getting Started', order: 1, published: true },
    { id: 'article-2', title: 'Advanced Features', order: 2, published: true },
  ],
  total: 2,
  page: 1,
  limit: 20,
  totalPages: 1,
};

describe('help-article-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      helpArticle: { list: { query: mockHelpArticleList } },
    });
  });

  // ── fetchHelpArticlesFirstPage ────────────────────────────────────────────

  describe('fetchHelpArticlesFirstPage', () => {
    it('calls cacheLife with LIST_PAGE ("minutes") profile', async () => {
      mockHelpArticleList.mockResolvedValue(SAMPLE_HELP_ARTICLES_PAGE);

      await fetchHelpArticlesFirstPage('tok');

      expect(mockCacheLife).toHaveBeenCalledWith('minutes');
    });

    it('always tags with HELP_ARTICLES_LIST ("help-articles:list")', async () => {
      mockHelpArticleList.mockResolvedValue(SAMPLE_HELP_ARTICLES_PAGE);

      await fetchHelpArticlesFirstPage('tok');

      expect(mockCacheTag).toHaveBeenCalledWith('help-articles:list');
    });

    it('calls helpArticle.list with page 1, limit 20, orderBy "order", orderDir "asc"', async () => {
      mockHelpArticleList.mockResolvedValue(SAMPLE_HELP_ARTICLES_PAGE);

      await fetchHelpArticlesFirstPage('tok');

      expect(mockHelpArticleList).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        orderBy: 'order',
        orderDir: 'asc',
      });
    });

    it('creates caller from the provided token', async () => {
      mockHelpArticleList.mockResolvedValue(SAMPLE_HELP_ARTICLES_PAGE);

      await fetchHelpArticlesFirstPage('my-jwt-token');

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith('my-jwt-token');
    });

    it('returns the result from caller.helpArticle.list unchanged', async () => {
      mockHelpArticleList.mockResolvedValue(SAMPLE_HELP_ARTICLES_PAGE);

      const result = await fetchHelpArticlesFirstPage('tok');

      expect(result).toEqual(SAMPLE_HELP_ARTICLES_PAGE);
    });

    it('works with a null token (unauthenticated path)', async () => {
      mockHelpArticleList.mockResolvedValue(SAMPLE_HELP_ARTICLES_PAGE);

      await fetchHelpArticlesFirstPage(null);

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
    });
  });
});
