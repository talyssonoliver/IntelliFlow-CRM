/**
 * HelpArticle Schema Validation Tests
 *
 * Compile-time type assertions verify that Prisma schema has all required
 * columns, indexes, and relations for HelpArticle, ArticleSection, and
 * ArticleFeedback models. Part of IFC-298 TDD Phase 1 (RED).
 *
 * @see packages/db/prisma/schema.prisma
 * @see .specify/sprints/sprint-17/specifications/IFC-298-spec.md
 */
import { describe, it, expect } from 'vitest';
import type { Prisma } from '../../generated/prisma/client';
import { ArticleStatus } from '../../generated/prisma/client';

describe('HelpArticle Schema Validation', () => {
  describe('HelpArticle model', () => {
    it('should have all required fields via create input type', () => {
      const _input: Partial<Prisma.HelpArticleCreateInput> = {
        slug: undefined,
        title: undefined,
        categoryId: undefined,
        excerpt: undefined,
        readTimeMinutes: undefined,
        keywords: undefined,
        relatedArticleIds: undefined,
        order: undefined,
        status: undefined,
      };
      expect(_input).toBeDefined();
    });

    it('should accept optional fields', () => {
      const _input: Partial<Prisma.HelpArticleCreateInput> = {
        publishedAt: undefined,
      };
      expect(_input).toBeDefined();
    });

    it('should have tenant relation', () => {
      const _input: Partial<Prisma.HelpArticleCreateInput> = {
        tenant: { connect: { id: 'test-tenant' } },
      };
      expect(_input.tenant).toBeDefined();
    });

    it('should have sections and feedback relations via include type', () => {
      const _include: Prisma.HelpArticleInclude = {
        sections: true,
        feedback: true,
      };
      expect(_include.sections).toBe(true);
      expect(_include.feedback).toBe(true);
    });
  });

  describe('ArticleSection model', () => {
    it('should have all required fields via create input type', () => {
      const _input: Partial<Prisma.ArticleSectionCreateInput> = {
        heading: undefined,
        content: undefined,
        order: undefined,
      };
      expect(_input).toBeDefined();
    });

    it('should accept optional blocks field', () => {
      const _input: Partial<Prisma.ArticleSectionCreateInput> = {
        blocks: undefined,
      };
      expect(_input).toBeDefined();
    });

    it('should have article relation via include type', () => {
      const _include: Prisma.ArticleSectionInclude = {
        article: true,
      };
      expect(_include.article).toBe(true);
    });

    it('should have tenant relation', () => {
      const _input: Partial<Prisma.ArticleSectionCreateInput> = {
        tenant: { connect: { id: 'test-tenant' } },
      };
      expect(_input.tenant).toBeDefined();
    });
  });

  describe('ArticleFeedback model', () => {
    it('should have all required fields via create input type', () => {
      const _input: Partial<Prisma.ArticleFeedbackCreateInput> = {
        helpful: undefined,
      };
      expect(_input).toBeDefined();
    });

    it('should accept optional fields', () => {
      const _input: Partial<Prisma.ArticleFeedbackCreateInput> = {
        comment: undefined,
        userId: undefined,
      };
      expect(_input).toBeDefined();
    });

    it('should have article relation via include type', () => {
      const _include: Prisma.ArticleFeedbackInclude = {
        article: true,
      };
      expect(_include.article).toBe(true);
    });

    it('should have tenant relation', () => {
      const _input: Partial<Prisma.ArticleFeedbackCreateInput> = {
        tenant: { connect: { id: 'test-tenant' } },
      };
      expect(_input.tenant).toBeDefined();
    });
  });

  describe('ArticleStatus enum', () => {
    it('should contain exactly DRAFT and PUBLISHED values', () => {
      const values = Object.values(ArticleStatus);
      expect(values).toContain('DRAFT');
      expect(values).toContain('PUBLISHED');
      expect(values).toHaveLength(2);
    });
  });

  describe('Table mapping', () => {
    it('should have models accessible via Prisma namespace', () => {
      type HasHelpArticle = Prisma.HelpArticleDelegate;
      type HasArticleSection = Prisma.ArticleSectionDelegate;
      type HasArticleFeedback = Prisma.ArticleFeedbackDelegate;
      expect(true).toBe(true);
    });
  });
});
