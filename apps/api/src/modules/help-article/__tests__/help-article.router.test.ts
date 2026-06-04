/**
 * Help Article Router Tests (IFC-299)
 *
 * Tests for all 9 helpArticle tRPC procedures:
 * list, getBySlug, getByCategory, getRelated,
 * create, update, delete, publish, unpublish
 */

import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@intelliflow/db';
import { helpArticleRouter } from '../help-article.router';
import {
  prismaMock,
  createTestContext,
  createPublicContext,
  createAdminContext,
  TEST_UUIDS,
  generateTestUUID,
} from '../../../test/setup';

// Mock createTenantScopedPrisma to return the same prismaMock
// instead of creating a new Prisma extension (which loses mock setup)
vi.mock('../../../security/tenant-context', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createTenantScopedPrisma: vi.fn((prisma: unknown) => prisma),
  };
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ARTICLE_ID_1 = generateTestUUID('help-article-1');
const ARTICLE_ID_2 = generateTestUUID('help-article-2');

const mockSection = {
  id: generateTestUUID('section-1'),
  heading: 'Getting Started',
  content: 'Learn how to use IntelliFlow CRM.',
  blocks: null,
  order: 0,
  articleId: ARTICLE_ID_1,
  tenantId: TEST_UUIDS.tenant,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const mockArticle = {
  id: ARTICLE_ID_1,
  slug: 'getting-started',
  title: 'Getting Started',
  categoryId: 'cat-onboarding',
  excerpt: 'Learn how to get started with IntelliFlow.',
  readTimeMinutes: 5,
  keywords: ['crm', 'setup'],
  relatedArticleIds: [],
  order: 1,
  status: 'DRAFT' as const,
  publishedAt: null,
  tenantId: TEST_UUIDS.tenant,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const mockPublishedArticle = {
  ...mockArticle,
  id: ARTICLE_ID_2,
  slug: 'advanced-features',
  title: 'Advanced Features',
  status: 'PUBLISHED' as const,
  publishedAt: new Date('2026-01-15'),
};

const mockArticleWithSections = {
  ...mockArticle,
  sections: [mockSection],
  _count: { feedback: 3 },
};

const mockPublishedWithSections = {
  ...mockPublishedArticle,
  sections: [mockSection],
  _count: { feedback: 5 },
};

// Helper to create list-shape articles (with _count)
const mockListArticle = {
  ...mockArticle,
  _count: { feedback: 3 },
};

const mockListPublished = {
  ...mockPublishedArticle,
  _count: { feedback: 5 },
};

// ─── Auth Tests ──────────────────────────────────────────────────────────────

describe('helpArticleRouter', () => {
  describe('Auth — unauthenticated rejection', () => {
    const procedures = [
      { name: 'list', input: {} },
      { name: 'getBySlug', input: { slug: 'test' } },
      { name: 'getByCategory', input: { categoryId: 'cat-1' } },
      { name: 'getRelated', input: { id: ARTICLE_ID_1 } },
      {
        name: 'create',
        input: {
          slug: 'test',
          title: 'Test',
          categoryId: 'cat-1',
          excerpt: 'Test',
          readTimeMinutes: 5,
          sections: [{ heading: 'H', content: 'C' }],
        },
      },
      { name: 'update', input: { id: ARTICLE_ID_1, title: 'Updated' } },
      { name: 'delete', input: { id: ARTICLE_ID_1 } },
      { name: 'publish', input: { id: ARTICLE_ID_1 } },
      { name: 'unpublish', input: { id: ARTICLE_ID_1 } },
      { name: 'submitFeedback', input: { articleId: ARTICLE_ID_1, value: 'helpful' } },
      { name: 'getFeedbackStats', input: { articleId: ARTICLE_ID_1 } },
    ] as const;

    for (const { name, input } of procedures) {
      it(`${name} rejects unauthenticated calls`, async () => {
        const caller = helpArticleRouter.createCaller(createPublicContext());
        await expect((caller as any)[name](input)).rejects.toMatchObject({
          code: 'UNAUTHORIZED',
        });
      });
    }
  });

  // ─── list ────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns empty array when no articles exist', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findMany.mockResolvedValue([]);
      (prismaMock.helpArticle as any).count.mockResolvedValue(0);

      const result = await caller.list({});
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns articles with pagination metadata', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findMany.mockResolvedValue([mockListArticle]);
      (prismaMock.helpArticle as any).count.mockResolvedValue(1);

      const result = await caller.list({ page: 1, limit: 20 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('filters by status', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findMany.mockResolvedValue([mockListPublished]);
      (prismaMock.helpArticle as any).count.mockResolvedValue(1);

      await caller.list({ status: 'PUBLISHED' });
      expect((prismaMock.helpArticle as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PUBLISHED' }),
        })
      );
    });

    it('filters by categoryId', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findMany.mockResolvedValue([mockListArticle]);
      (prismaMock.helpArticle as any).count.mockResolvedValue(1);

      await caller.list({ categoryId: 'cat-onboarding' });
      expect((prismaMock.helpArticle as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryId: 'cat-onboarding' }),
        })
      );
    });

    it('searches by title/excerpt', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findMany.mockResolvedValue([]);
      (prismaMock.helpArticle as any).count.mockResolvedValue(0);

      await caller.list({ search: 'started' });
      expect((prismaMock.helpArticle as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ title: expect.objectContaining({ contains: 'started' }) }),
            ]),
          }),
        })
      );
    });

    it('non-privileged users only see PUBLISHED articles by default', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.helpArticle as any).findMany.mockResolvedValue([]);
      (prismaMock.helpArticle as any).count.mockResolvedValue(0);

      await caller.list({});
      expect((prismaMock.helpArticle as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PUBLISHED' }),
        })
      );
    });

    it('non-privileged users cannot request DRAFT via explicit status filter', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.helpArticle as any).findMany.mockResolvedValue([]);
      (prismaMock.helpArticle as any).count.mockResolvedValue(0);

      await caller.list({ status: 'DRAFT' });
      // Should override DRAFT to PUBLISHED for non-privileged users
      expect((prismaMock.helpArticle as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PUBLISHED' }),
        })
      );
    });
  });

  // ─── getBySlug ───────────────────────────────────────────────────────────

  describe('getBySlug', () => {
    it('returns article with sections when found', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findUnique.mockResolvedValue(mockPublishedWithSections);

      const result = await caller.getBySlug({ slug: 'advanced-features' });
      expect(result.slug).toBe('advanced-features');
      expect(result.sections).toHaveLength(1);
      expect(result.feedbackCount).toBe(5);
    });

    it('throws NOT_FOUND when slug does not exist', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findUnique.mockResolvedValue(null);

      await expect(caller.getBySlug({ slug: 'nonexistent' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('hides DRAFT articles from non-privileged users', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.helpArticle as any).findUnique.mockResolvedValue(mockArticleWithSections);

      await expect(caller.getBySlug({ slug: 'getting-started' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  // ─── getByCategory ───────────────────────────────────────────────────────

  describe('getByCategory', () => {
    it('returns ordered articles for category', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.helpArticle as any).findMany.mockResolvedValue([mockListPublished]);

      const result = await caller.getByCategory({ categoryId: 'cat-onboarding' });
      expect(result).toHaveLength(1);
    });

    it('returns empty array for unknown category', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.helpArticle as any).findMany.mockResolvedValue([]);

      const result = await caller.getByCategory({ categoryId: 'cat-unknown' });
      expect(result).toEqual([]);
    });

    it('defaults to PUBLISHED only', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.helpArticle as any).findMany.mockResolvedValue([]);

      await caller.getByCategory({ categoryId: 'cat-1' });
      expect((prismaMock.helpArticle as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PUBLISHED' }),
        })
      );
    });

    it('non-privileged users cannot bypass PUBLISHED filter via includeUnpublished', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.helpArticle as any).findMany.mockResolvedValue([]);

      await caller.getByCategory({ categoryId: 'cat-1', includeUnpublished: true });
      // Should still filter to PUBLISHED for non-privileged users
      expect((prismaMock.helpArticle as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PUBLISHED' }),
        })
      );
    });
  });

  // ─── getRelated ──────────────────────────────────────────────────────────

  describe('getRelated', () => {
    it('resolves relatedArticleIds to actual articles', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue({
        relatedArticleIds: [ARTICLE_ID_2],
      });
      (prismaMock.helpArticle as any).findMany.mockResolvedValue([
        {
          id: ARTICLE_ID_2,
          slug: 'advanced-features',
          title: 'Advanced Features',
          excerpt: 'Learn advanced features',
          readTimeMinutes: 10,
          categoryId: 'cat-advanced',
        },
      ]);

      const result = await caller.getRelated({ id: ARTICLE_ID_1 });
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe('advanced-features');
    });

    it('returns empty array when no relatedArticleIds', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue({ relatedArticleIds: [] });

      const result = await caller.getRelated({ id: ARTICLE_ID_1 });
      expect(result).toEqual([]);
    });

    it('throws NOT_FOUND when source article does not exist', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue(null);

      await expect(caller.getRelated({ id: TEST_UUIDS.nonExistent })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('filters by tenantId for security', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue({
        relatedArticleIds: [ARTICLE_ID_2],
      });
      (prismaMock.helpArticle as any).findMany.mockResolvedValue([]);

      await caller.getRelated({ id: ARTICLE_ID_1 });
      expect((prismaMock.helpArticle as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TEST_UUIDS.tenant }),
        })
      );
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    const validInput = {
      slug: 'new-article',
      title: 'New Article',
      categoryId: 'cat-guides',
      excerpt: 'A new article.',
      readTimeMinutes: 3,
      sections: [{ heading: 'Intro', content: 'Introduction text.' }],
    };

    it('creates article with sections successfully', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findUnique.mockResolvedValue(null);
      (prismaMock.helpArticle as any).create.mockResolvedValue({
        ...mockArticle,
        slug: 'new-article',
        title: 'New Article',
        sections: [mockSection],
      });

      const result = await caller.create(validInput);
      expect(result.slug).toBe('new-article');
    });

    it('injects tenantId from context, not from client', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findUnique.mockResolvedValue(null);
      (prismaMock.helpArticle as any).create.mockResolvedValue({
        ...mockArticle,
        sections: [mockSection],
      });

      await caller.create(validInput);
      expect((prismaMock.helpArticle as any).create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: TEST_UUIDS.tenant }),
        })
      );
    });

    it('throws CONFLICT on slug collision', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findUnique.mockResolvedValue({ id: ARTICLE_ID_1 });

      await expect(caller.create(validInput)).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('rejects missing title via Zod validation', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());

      await expect(caller.create({ ...validInput, title: '' } as any)).rejects.toThrow();
    });

    it('rejects empty slug via Zod validation', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());

      await expect(caller.create({ ...validInput, slug: '' } as any)).rejects.toThrow();
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates article fields successfully', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue(mockArticle);
      const mockTx = {
        helpArticle: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            ...mockArticle,
            title: 'Updated Title',
            sections: [mockSection],
          }),
        },
        articleSection: {
          deleteMany: (prismaMock.articleSection as any).deleteMany,
          createMany: (prismaMock.articleSection as any).createMany,
        },
      };
      (prismaMock as any).$transaction.mockImplementation(async (fn: any) => fn(mockTx));

      const result = await caller.update({ id: ARTICLE_ID_1, title: 'Updated Title' });
      expect(result.title).toBe('Updated Title');
    });

    it('replaces sections when provided', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue(mockArticle);
      const mockTx = {
        helpArticle: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            ...mockArticle,
            sections: [{ ...mockSection, heading: 'New Section' }],
          }),
        },
        articleSection: {
          deleteMany: (prismaMock.articleSection as any).deleteMany,
          createMany: (prismaMock.articleSection as any).createMany,
        },
      };
      (prismaMock as any).$transaction.mockImplementation(async (fn: any) => fn(mockTx));

      await caller.update({
        id: ARTICLE_ID_1,
        sections: [{ heading: 'New Section', content: 'New content' }],
      });
      expect((prismaMock.articleSection as any).deleteMany).toHaveBeenCalled();
      expect((prismaMock.articleSection as any).createMany).toHaveBeenCalled();
    });

    it('throws NOT_FOUND when article does not exist', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue(null);

      await expect(caller.update({ id: TEST_UUIDS.nonExistent, title: 'X' })).rejects.toMatchObject(
        { code: 'NOT_FOUND' }
      );
    });

    it('throws CONFLICT on slug collision during update', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue(mockArticle);
      (prismaMock.helpArticle as any).findUnique.mockResolvedValue({ id: ARTICLE_ID_2 });

      await expect(caller.update({ id: ARTICLE_ID_1, slug: 'taken-slug' })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('rejects USER role with FORBIDDEN', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());

      await expect(caller.update({ id: ARTICLE_ID_1, title: 'X' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes existing article', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue(mockArticle);
      (prismaMock.helpArticle as any).deleteMany.mockResolvedValue({ count: 1 });

      const result = await caller.delete({ id: ARTICLE_ID_1 });
      expect(result).toEqual({ success: true });
    });

    it('throws NOT_FOUND when article does not exist', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue(null);

      await expect(caller.delete({ id: TEST_UUIDS.nonExistent })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('rejects non-ADMIN role with FORBIDDEN', async () => {
      const caller = helpArticleRouter.createCaller(
        createTestContext({
          user: {
            userId: TEST_UUIDS.user1,
            email: 'mgr@test.com',
            role: 'MANAGER',
            tenantId: TEST_UUIDS.tenant,
          },
          tenant: {
            tenantId: TEST_UUIDS.tenant,
            tenantType: 'user' as const,
            userId: TEST_UUIDS.user1,
            role: 'MANAGER',
            canAccessAllTenantData: true,
          },
        })
      );

      await expect(caller.delete({ id: ARTICLE_ID_1 })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  // ─── publish ─────────────────────────────────────────────────────────────

  describe('publish', () => {
    it('publishes a DRAFT article', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue({
        id: ARTICLE_ID_1,
        status: 'DRAFT',
      });
      (prismaMock.helpArticle as any).updateMany.mockResolvedValue({ count: 1 });

      const result = await caller.publish({ id: ARTICLE_ID_1 });
      expect(result.status).toBe('PUBLISHED');
      expect(result.publishedAt).toBeDefined();
    });

    it('throws BAD_REQUEST when already published', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue({
        id: ARTICLE_ID_1,
        status: 'PUBLISHED',
      });

      await expect(caller.publish({ id: ARTICLE_ID_1 })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    it('throws NOT_FOUND when article does not exist', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue(null);

      await expect(caller.publish({ id: TEST_UUIDS.nonExistent })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  // ─── unpublish ───────────────────────────────────────────────────────────

  describe('unpublish', () => {
    it('unpublishes a PUBLISHED article', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue({
        id: ARTICLE_ID_1,
        status: 'PUBLISHED',
      });
      (prismaMock.helpArticle as any).updateMany.mockResolvedValue({ count: 1 });

      const result = await caller.unpublish({ id: ARTICLE_ID_1 });
      expect(result.status).toBe('DRAFT');
      expect(result.publishedAt).toBeNull();
    });

    it('throws BAD_REQUEST when already draft', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue({
        id: ARTICLE_ID_1,
        status: 'DRAFT',
      });

      await expect(caller.unpublish({ id: ARTICLE_ID_1 })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    it('throws NOT_FOUND when article does not exist', async () => {
      const caller = helpArticleRouter.createCaller(createAdminContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue(null);

      await expect(caller.unpublish({ id: TEST_UUIDS.nonExistent })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  // ─── submitFeedback (IFC-303) ───────────────────────────────────────────

  describe('submitFeedback', () => {
    it('creates feedback with helpful: true for "helpful" value', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      const mockFeedback = {
        id: generateTestUUID('feedback-1'),
        articleId: ARTICLE_ID_1,
        helpful: true,
        comment: null,
        userId: TEST_UUIDS.user1,
        tenantId: TEST_UUIDS.tenant,
        createdAt: new Date('2026-03-19'),
      };
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue({ id: ARTICLE_ID_1 });
      (prismaMock.articleFeedback as any).create.mockResolvedValue(mockFeedback);

      const result = await caller.submitFeedback({
        articleId: ARTICLE_ID_1,
        value: 'helpful',
      });

      expect(result.id).toBe(mockFeedback.id);
      expect(result.helpful).toBe(true);
      expect(result.createdAt).toEqual(mockFeedback.createdAt);
      expect((prismaMock.articleFeedback as any).create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          articleId: ARTICLE_ID_1,
          helpful: true,
          comment: undefined,
          userId: TEST_UUIDS.user1,
          tenantId: TEST_UUIDS.tenant,
        }),
      });
    });

    it('creates feedback with helpful: false for "not_helpful" value', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      const mockFeedback = {
        id: generateTestUUID('feedback-2'),
        articleId: ARTICLE_ID_1,
        helpful: false,
        comment: null,
        userId: TEST_UUIDS.user1,
        tenantId: TEST_UUIDS.tenant,
        createdAt: new Date('2026-03-19'),
      };
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue({ id: ARTICLE_ID_1 });
      (prismaMock.articleFeedback as any).create.mockResolvedValue(mockFeedback);

      const result = await caller.submitFeedback({
        articleId: ARTICLE_ID_1,
        value: 'not_helpful',
      });

      expect(result.helpful).toBe(false);
      expect((prismaMock.articleFeedback as any).create).toHaveBeenCalledWith({
        data: expect.objectContaining({ helpful: false }),
      });
    });

    it('stores optional comment when provided', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      const mockFeedback = {
        id: generateTestUUID('feedback-3'),
        articleId: ARTICLE_ID_1,
        helpful: true,
        comment: 'Very useful article!',
        userId: TEST_UUIDS.user1,
        tenantId: TEST_UUIDS.tenant,
        createdAt: new Date('2026-03-19'),
      };
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue({ id: ARTICLE_ID_1 });
      (prismaMock.articleFeedback as any).create.mockResolvedValue(mockFeedback);

      await caller.submitFeedback({
        articleId: ARTICLE_ID_1,
        value: 'helpful',
        comment: 'Very useful article!',
      });

      expect((prismaMock.articleFeedback as any).create).toHaveBeenCalledWith({
        data: expect.objectContaining({ comment: 'Very useful article!' }),
      });
    });

    it('rejects empty articleId', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());

      await expect(caller.submitFeedback({ articleId: '', value: 'helpful' })).rejects.toThrow();
    });

    it('rejects invalid value enum', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());

      await expect(
        caller.submitFeedback({ articleId: ARTICLE_ID_1, value: 'invalid' as any })
      ).rejects.toThrow();
    });

    it('throws NOT_FOUND when article does not belong to tenant', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue(null);

      await expect(
        caller.submitFeedback({ articleId: ARTICLE_ID_1, value: 'helpful' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('sets userId from ctx.tenant.userId', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue({ id: ARTICLE_ID_1 });
      (prismaMock.articleFeedback as any).create.mockResolvedValue({
        id: generateTestUUID('feedback-4'),
        helpful: true,
        createdAt: new Date(),
      });

      await caller.submitFeedback({ articleId: ARTICLE_ID_1, value: 'helpful' });

      expect((prismaMock.articleFeedback as any).create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: TEST_UUIDS.user1 }),
      });
    });

    it('sets tenantId from ctx.tenant.tenantId', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue({ id: ARTICLE_ID_1 });
      (prismaMock.articleFeedback as any).create.mockResolvedValue({
        id: generateTestUUID('feedback-5'),
        helpful: true,
        createdAt: new Date(),
      });

      await caller.submitFeedback({ articleId: ARTICLE_ID_1, value: 'helpful' });

      expect((prismaMock.articleFeedback as any).create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tenantId: TEST_UUIDS.tenant }),
      });
    });

    it('verifies article ownership before writing feedback', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.helpArticle as any).findFirst.mockResolvedValue({ id: ARTICLE_ID_1 });
      (prismaMock.articleFeedback as any).create.mockResolvedValue({
        id: generateTestUUID('feedback-6'),
        helpful: true,
        createdAt: new Date(),
      });

      await caller.submitFeedback({ articleId: ARTICLE_ID_1, value: 'helpful' });

      expect((prismaMock.helpArticle as any).findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: ARTICLE_ID_1,
            tenantId: TEST_UUIDS.tenant,
          }),
        })
      );
    });
  });

  // ─── getFeedbackStats (IFC-303) ───────────────────────────────────────

  describe('getFeedbackStats', () => {
    it('returns correct helpful/notHelpful/total for mixed feedback', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.articleFeedback as any).count
        .mockResolvedValueOnce(3) // helpful=true count
        .mockResolvedValueOnce(5); // total count

      const result = await caller.getFeedbackStats({ articleId: ARTICLE_ID_1 });

      expect(result).toEqual({ helpful: 3, notHelpful: 2, total: 5 });
    });

    it('returns zeros for article with no feedback', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.articleFeedback as any).count
        .mockResolvedValueOnce(0) // helpful=true count
        .mockResolvedValueOnce(0); // total count

      const result = await caller.getFeedbackStats({ articleId: ARTICLE_ID_1 });

      expect(result).toEqual({ helpful: 0, notHelpful: 0, total: 0 });
    });

    it('scopes count queries to the given articleId and tenantId', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      (prismaMock.articleFeedback as any).count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

      await caller.getFeedbackStats({ articleId: ARTICLE_ID_1 });

      expect((prismaMock.articleFeedback as any).count).toHaveBeenCalledWith({
        where: { articleId: ARTICLE_ID_1, tenantId: TEST_UUIDS.tenant, helpful: true },
      });
      expect((prismaMock.articleFeedback as any).count).toHaveBeenCalledWith({
        where: { articleId: ARTICLE_ID_1, tenantId: TEST_UUIDS.tenant },
      });
    });
  });

  // ─── Role Guards ─────────────────────────────────────────────────────────

  describe('Role guards — write operations', () => {
    it('create rejects USER role', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      await expect(
        caller.create({
          slug: 'test',
          title: 'Test',
          categoryId: 'cat-1',
          excerpt: 'Test',
          readTimeMinutes: 5,
          sections: [{ heading: 'H', content: 'C' }],
        })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('update rejects USER role', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      await expect(caller.update({ id: ARTICLE_ID_1, title: 'Updated' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('delete rejects USER role', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      await expect(caller.delete({ id: ARTICLE_ID_1 })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('publish rejects USER role', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      await expect(caller.publish({ id: ARTICLE_ID_1 })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('unpublish rejects USER role', async () => {
      const caller = helpArticleRouter.createCaller(createTestContext());
      await expect(caller.unpublish({ id: ARTICLE_ID_1 })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });
});
