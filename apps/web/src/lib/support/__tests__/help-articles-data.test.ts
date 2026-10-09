import { describe, it, expect } from 'vitest';
import helpArticlesJson from '@/data/help-articles.json';
import { DEFAULT_HELP_ARTICLES, parseHelpArticles } from '../help-articles';

/** The help articles live in data/help-articles.json; this pins the load-time check. */
describe('help-articles.json', () => {
  const valid = {
    id: 'x-001',
    slug: 'x',
    title: 'X',
    categoryId: 'getting-started',
    excerpt: 'E',
    readTimeMinutes: 2,
    lastUpdatedAt: '2026-10-07',
    keywords: ['k'],
    relatedArticleIds: [],
    order: 1,
    sections: [
      {
        heading: 'H',
        content: 'C',
        blocks: [
          { type: 'paragraph', text: 'p' },
          { type: 'steps', items: ['a', 'b'] },
          { type: 'tip', text: 't' },
          { type: 'nav-path', path: ['Settings', 'Team'] },
        ],
      },
      { heading: 'Plain', content: 'No blocks' },
    ],
  };

  it('loads every shipped article', () => {
    expect(DEFAULT_HELP_ARTICLES).toHaveLength((helpArticlesJson as unknown[]).length);
    expect(DEFAULT_HELP_ARTICLES.length).toBeGreaterThan(10);
    expect(new Set(DEFAULT_HELP_ARTICLES.map((a) => a.slug)).size).toBe(
      DEFAULT_HELP_ARTICLES.length
    );
  });

  it('accepts an article with every block type', () => {
    expect(parseHelpArticles([valid])).toHaveLength(1);
  });

  it.each([
    ['an unknown block type', { type: 'video', url: 'u' }],
    ['a text block without text', { type: 'warning' }],
    ['steps without items', { type: 'steps', text: 'x' }],
    ['a nav-path without a path', { type: 'nav-path' }],
    ['a block without a type', { text: 'x' }],
  ])('rejects %s', (_label, block) => {
    const bad = { ...valid, sections: [{ heading: 'H', content: 'C', blocks: [block] }] };
    expect(() => parseHelpArticles([valid, bad])).toThrow(
      'data/help-articles.json: entry 1 does not match its type'
    );
  });

  it('rejects an article missing a field, or with sections that are not a list', () => {
    const { slug: _slug, ...noSlug } = valid;
    expect(() => parseHelpArticles([noSlug])).toThrow(/entry 0/);
    expect(() => parseHelpArticles([{ ...valid, sections: 'none' }])).toThrow(/entry 0/);
    expect(() =>
      parseHelpArticles([{ ...valid, sections: [{ heading: 'H', content: 'C', blocks: 'x' }] }])
    ).toThrow(/entry 0/);
    expect(() => parseHelpArticles([{ ...valid, sections: [{ content: 'C' }] }])).toThrow(
      /entry 0/
    );
  });
});
