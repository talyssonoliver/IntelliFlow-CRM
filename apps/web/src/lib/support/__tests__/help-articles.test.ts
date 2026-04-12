import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HELP_ARTICLES,
  getArticleBySlug,
  getArticlesByCategory,
  getRelatedArticles,
} from '../help-articles';
import type { HelpArticle } from '../help-articles';
import { DEFAULT_HELP_CATEGORIES } from '../help-categories';

describe('help-articles data module', () => {
  describe('DEFAULT_HELP_ARTICLES', () => {
    it('is a non-empty readonly array', () => {
      expect(Array.isArray(DEFAULT_HELP_ARTICLES)).toBe(true);
      expect(DEFAULT_HELP_ARTICLES.length).toBeGreaterThan(0);
    });

    it('every article has required fields', () => {
      for (const article of DEFAULT_HELP_ARTICLES) {
        expect(article.id).toBeTruthy();
        expect(article.slug).toBeTruthy();
        expect(article.title).toBeTruthy();
        expect(article.categoryId).toBeTruthy();
        expect(article.excerpt).toBeTruthy();
        expect(Array.isArray(article.sections)).toBe(true);
        expect(article.readTimeMinutes).toBeGreaterThan(0);
        expect(article.lastUpdatedAt).toBeTruthy();
        expect(Array.isArray(article.keywords)).toBe(true);
        expect(Array.isArray(article.relatedArticleIds)).toBe(true);
        expect(typeof article.order).toBe('number');
      }
    });

    it('every article categoryId matches a valid HelpCategory.id', () => {
      const validCategoryIds = DEFAULT_HELP_CATEGORIES.map((c) => c.id);
      for (const article of DEFAULT_HELP_ARTICLES) {
        expect(validCategoryIds).toContain(article.categoryId);
      }
    });

    it('has no duplicate slugs', () => {
      const slugs = DEFAULT_HELP_ARTICLES.map((a) => a.slug);
      const uniqueSlugs = new Set(slugs);
      expect(uniqueSlugs.size).toBe(slugs.length);
    });

    it('article slugs do not collide with category IDs', () => {
      const categoryIds = new Set(DEFAULT_HELP_CATEGORIES.map((c) => c.id));
      for (const article of DEFAULT_HELP_ARTICLES) {
        expect(categoryIds.has(article.slug)).toBe(false);
      }
    });
  });

  describe('getArticleBySlug', () => {
    it('returns the correct article for a valid slug', () => {
      const firstArticle = DEFAULT_HELP_ARTICLES[0];
      const result = getArticleBySlug(firstArticle.slug);
      expect(result).toBeDefined();
      expect(result!.slug).toBe(firstArticle.slug);
      expect(result!.title).toBe(firstArticle.title);
    });

    it('returns undefined for nonexistent slug', () => {
      expect(getArticleBySlug('nonexistent-slug-xyz')).toBeUndefined();
    });
  });

  describe('getArticlesByCategory', () => {
    it('returns articles filtered by categoryId', () => {
      const categoryId = DEFAULT_HELP_ARTICLES[0].categoryId;
      const results = getArticlesByCategory(categoryId);
      expect(results.length).toBeGreaterThan(0);
      for (const article of results) {
        expect(article.categoryId).toBe(categoryId);
      }
    });

    it('returns empty array for nonexistent category', () => {
      expect(getArticlesByCategory('nonexistent-category')).toEqual([]);
    });
  });

  describe('getRelatedArticles', () => {
    it('returns max 3 articles, excludes self', () => {
      // Find an article with relatedArticleIds
      const articleWithRelated = DEFAULT_HELP_ARTICLES.find((a) => a.relatedArticleIds.length > 0);
      if (!articleWithRelated) {
        // Skip if no articles have related — but the data should include some
        expect(articleWithRelated).toBeDefined();
        return;
      }
      const related = getRelatedArticles(articleWithRelated);
      expect(related.length).toBeLessThanOrEqual(3);
      expect(related.every((r) => r.id !== articleWithRelated.id)).toBe(true);
    });

    it('returns empty array for article with no related articles', () => {
      const noRelated: HelpArticle = {
        id: 'test-no-related',
        slug: 'test-no-related',
        title: 'Test',
        categoryId: 'getting-started',
        excerpt: 'Test article',
        sections: [],
        readTimeMinutes: 1,
        lastUpdatedAt: '2026-01-01',
        keywords: [],
        relatedArticleIds: [],
        order: 99,
      };
      expect(getRelatedArticles(noRelated)).toEqual([]);
    });
  });
});
