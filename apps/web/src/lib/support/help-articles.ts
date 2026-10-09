/**
 * Help Center Articles — Static structural data
 *
 * These are real application content (CRM help articles),
 * not mock data. Mirrors the help-categories.ts pattern.
 */

import { DEFAULT_HELP_CATEGORIES } from './help-categories';
import helpArticlesJson from '@/data/help-articles.json';
import { hasFields, isOneOf, parseJsonArray } from '@/lib/shared/json-data';

// ─── Content Block Types ──────────────────────────────────────────────────

export type ContentBlock =
  | { readonly type: 'paragraph'; readonly text: string }
  | { readonly type: 'steps'; readonly items: readonly string[] }
  | { readonly type: 'tip'; readonly text: string }
  | { readonly type: 'warning'; readonly text: string }
  | { readonly type: 'info'; readonly text: string }
  | { readonly type: 'nav-path'; readonly path: readonly string[] };

// ─── Article Types ────────────────────────────────────────────────────────

export interface ArticleSection {
  readonly heading: string;
  /** Plain-text fallback (used when blocks is absent) */
  readonly content: string;
  /** Rich content blocks — preferred over content when present */
  readonly blocks?: readonly ContentBlock[];
}

export interface HelpArticle {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly categoryId: string;
  readonly excerpt: string;
  readonly sections: readonly ArticleSection[];
  readonly readTimeMinutes: number;
  readonly lastUpdatedAt: string;
  readonly keywords: readonly string[];
  readonly relatedArticleIds: readonly string[];
  readonly order: number;
}

// ─── Article Data ─────────────────────────────────────────────────────────

// The articles are content, so they live in data/help-articles.json; their
// shape is checked once here, when the module loads.
const TEXT_BLOCKS = ['paragraph', 'tip', 'warning', 'info'] as const;

function isContentBlock(value: unknown): boolean {
  if (!hasFields(value, { type: 'string' })) return false;
  if (isOneOf(value.type, TEXT_BLOCKS)) return hasFields(value, { text: 'string' });
  if (value.type === 'steps') return hasFields(value, { items: 'string[]' });
  if (value.type === 'nav-path') return hasFields(value, { path: 'string[]' });
  return false;
}

function isArticleSection(value: unknown): boolean {
  if (!hasFields(value, { heading: 'string', content: 'string' })) return false;
  return (
    value.blocks === undefined ||
    (Array.isArray(value.blocks) && value.blocks.every(isContentBlock))
  );
}

function isHelpArticle(value: unknown): boolean {
  return (
    hasFields(value, {
      id: 'string',
      slug: 'string',
      title: 'string',
      categoryId: 'string',
      excerpt: 'string',
      readTimeMinutes: 'number',
      lastUpdatedAt: 'string',
      keywords: 'string[]',
      relatedArticleIds: 'string[]',
      order: 'number',
    }) &&
    Array.isArray(value.sections) &&
    value.sections.every(isArticleSection)
  );
}

/** Checks help-article content (the JSON's shape) and returns it typed. */
export function parseHelpArticles(data: unknown): readonly HelpArticle[] {
  return parseJsonArray<HelpArticle>(data, 'data/help-articles.json', isHelpArticle);
}

export const DEFAULT_HELP_ARTICLES: readonly HelpArticle[] = parseHelpArticles(helpArticlesJson);

// ─── Lookup Helpers ──────────────────────────────────────────────────────

export function getArticleBySlug(slug: string): HelpArticle | undefined {
  return DEFAULT_HELP_ARTICLES.find((a) => a.slug === slug);
}

export function getArticlesByCategory(categoryId: string): HelpArticle[] {
  return DEFAULT_HELP_ARTICLES.filter((a) => a.categoryId === categoryId);
}

export function getRelatedArticles(article: HelpArticle): HelpArticle[] {
  if (article.relatedArticleIds.length === 0) return [];
  return DEFAULT_HELP_ARTICLES.filter(
    (a) => article.relatedArticleIds.includes(a.id) && a.id !== article.id
  ).slice(0, 3);
}

// Re-export category lookup for convenience
export function getCategoryById(categoryId: string) {
  return DEFAULT_HELP_CATEGORIES.find((c) => c.id === categoryId);
}
