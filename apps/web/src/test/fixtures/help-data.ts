/**
 * Help Center Test Fixtures
 *
 * Re-exports from lib/support/help-categories and help-articles plus test-specific variants.
 */

export type { HelpCategory } from '@/lib/support/help-categories';
export { DEFAULT_HELP_CATEGORIES } from '@/lib/support/help-categories';
export type { HelpArticle } from '@/lib/support/help-articles';
export { DEFAULT_HELP_ARTICLES } from '@/lib/support/help-articles';

import type { HelpCategory } from '@/lib/support/help-categories';
import type { HelpArticle } from '@/lib/support/help-articles';

export const EMPTY_CATEGORIES: HelpCategory[] = [];

export const SINGLE_CATEGORY: HelpCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Quick start guides and onboarding',
    icon: 'rocket_launch',
    color: 'bg-blue-500',
    href: '/help-center/getting-started',
    articleCount: 5,
    popular: true,
    order: 0,
    keywords: ['setup', 'onboarding'],
  },
];

export const ALL_POPULAR_CATEGORIES: HelpCategory[] = [
  {
    id: 'cat-a',
    title: 'Category A',
    description: 'First popular category',
    icon: 'star',
    color: 'bg-blue-500',
    href: '/help-center/cat-a',
    articleCount: 3,
    popular: true,
    order: 0,
    keywords: ['alpha'],
  },
  {
    id: 'cat-b',
    title: 'Category B',
    description: 'Second popular category',
    icon: 'star',
    color: 'bg-green-500',
    href: '/help-center/cat-b',
    articleCount: 5,
    popular: true,
    order: 1,
    keywords: ['beta'],
  },
];

export const ZERO_ARTICLE_CATEGORY: HelpCategory[] = [
  {
    id: 'empty-cat',
    title: 'Empty Category',
    description: 'Category with no articles',
    icon: 'folder_open',
    color: 'bg-gray-500',
    href: '/help-center/empty-cat',
    articleCount: 0,
    popular: false,
    order: 0,
    keywords: ['empty'],
  },
];

// ─── Article Test Fixtures ───────────────────────────────────────────────

export const SAMPLE_ARTICLE: HelpArticle = {
  id: 'test-article-1',
  slug: 'test-article',
  title: 'Test Article Title',
  categoryId: 'getting-started',
  excerpt: 'A test article for rendering',
  sections: [
    { heading: 'First Section', content: 'Content for the first section.' },
    { heading: 'Second Section', content: 'Content for the second section.' },
  ],
  readTimeMinutes: 5,
  lastUpdatedAt: '2026-03-01',
  keywords: ['test'],
  relatedArticleIds: [],
  order: 0,
};

export const ARTICLE_NO_RELATED: HelpArticle = {
  ...SAMPLE_ARTICLE,
  id: 'no-related',
  slug: 'no-related-article',
  relatedArticleIds: [],
};

export const ARTICLE_EMPTY_CONTENT: HelpArticle = {
  ...SAMPLE_ARTICLE,
  id: 'empty-content',
  slug: 'empty-content-article',
  sections: [],
};
