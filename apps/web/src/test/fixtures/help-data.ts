/**
 * Help Center Test Fixtures
 *
 * Re-exports from lib/support/help-categories plus test-specific variants.
 */

export type { HelpCategory } from '@/lib/support/help-categories';
export { DEFAULT_HELP_CATEGORIES } from '@/lib/support/help-categories';

import type { HelpCategory } from '@/lib/support/help-categories';

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
