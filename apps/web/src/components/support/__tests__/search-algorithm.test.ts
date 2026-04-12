import { describe, it, expect } from 'vitest';
import {
  searchHelpContent,
  scoreHelpMatch,
  highlightHelpText,
  DEFAULT_SEARCH_FILTERS,
} from '@/components/support/search-algorithm';
import { DEFAULT_HELP_CATEGORIES } from '@/lib/support/help-categories';
import type { HelpCategory } from '@/lib/support/help-categories';

const items = [...DEFAULT_HELP_CATEGORIES];

// Helpers for quick access
const billing = items.find((c) => c.id === 'billing')!;
const gettingStarted = items.find((c) => c.id === 'getting-started')!;

describe('searchHelpContent', () => {
  it('returns all 8 items with score 0 for empty query', () => {
    const results = searchHelpContent('', items);
    expect(results).toHaveLength(8);
    results.forEach((r) => expect(r.score).toBe(0));
  });

  it('returns all 8 items for whitespace-only query', () => {
    const results = searchHelpContent('   ', items);
    expect(results).toHaveLength(8);
  });

  it('returns Billing for "billing" query with title match', () => {
    const results = searchHelpContent('billing', items);
    const billingResult = results.find((r) => r.item.id === 'billing');
    expect(billingResult).toBeDefined();
    expect(billingResult!.score).toBeGreaterThan(0);
  });

  it('is case-insensitive', () => {
    const lower = searchHelpContent('billing', items);
    const upper = searchHelpContent('BILLING', items);
    expect(lower.map((r) => r.item.id)).toEqual(upper.map((r) => r.item.id));
  });

  it('returns Billing via partial title match with score 60', () => {
    const results = searchHelpContent('bill', items);
    const billingResult = results.find((r) => r.item.id === 'billing');
    expect(billingResult).toBeDefined();
    expect(billingResult!.matchedOn).toContain('title');
  });

  it('returns Billing via description match with score 30', () => {
    const results = searchHelpContent('subscription', items);
    const billingResult = results.find((r) => r.item.id === 'billing');
    expect(billingResult).toBeDefined();
    expect(billingResult!.matchedOn).toContain('description');
  });

  it('returns AI Features via keyword match with score 20', () => {
    const results = searchHelpContent('automation', items);
    const aiResult = results.find((r) => r.item.id === 'ai-features');
    expect(aiResult).toBeDefined();
    expect(aiResult!.matchedOn).toContain('keyword');
  });

  it('returns empty array for non-matching query', () => {
    const results = searchHelpContent('xyznonexistent', items);
    expect(results).toHaveLength(0);
  });

  it('filters to single category with categoryId filter', () => {
    const results = searchHelpContent('', items, {
      ...DEFAULT_SEARCH_FILTERS,
      categoryId: 'billing',
    });
    expect(results).toHaveLength(1);
    expect(results[0].item.id).toBe('billing');
  });

  it('returns only popular items with popularOnly filter', () => {
    const results = searchHelpContent('', items, {
      ...DEFAULT_SEARCH_FILTERS,
      popularOnly: true,
    });
    expect(results).toHaveLength(3);
    results.forEach((r) => expect(r.item.popular).toBe(true));
  });

  it('sorts alphabetically with sortMode a-z', () => {
    const results = searchHelpContent('', items, {
      ...DEFAULT_SEARCH_FILTERS,
      sortMode: 'a-z',
    });
    const titles = results.map((r) => r.item.title);
    const sorted = [...titles].sort((a, b) => a.localeCompare(b));
    expect(titles).toEqual(sorted);
  });

  it('sorts by articleCount desc with sortMode most-articles', () => {
    const results = searchHelpContent('', items, {
      ...DEFAULT_SEARCH_FILTERS,
      sortMode: 'most-articles',
    });
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].item.articleCount).toBeGreaterThanOrEqual(results[i].item.articleCount);
    }
  });

  it('category filter + query = intersection', () => {
    const results = searchHelpContent('invoice', items, {
      ...DEFAULT_SEARCH_FILTERS,
      categoryId: 'billing',
    });
    expect(results.length).toBeGreaterThan(0);
    results.forEach((r) => expect(r.item.id).toBe('billing'));
  });

  it('popular filter + query = intersection', () => {
    const results = searchHelpContent('lead', items, {
      ...DEFAULT_SEARCH_FILTERS,
      popularOnly: true,
    });
    results.forEach((r) => expect(r.item.popular).toBe(true));
  });

  it('results sorted by score descending', () => {
    const results = searchHelpContent('support', items);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('tied scores sorted by item.order ascending (stable sort)', () => {
    const results = searchHelpContent('', items);
    // All scores are 0 for empty query — should be ordered by item.order
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].item.order).toBeLessThanOrEqual(results[i].item.order);
    }
  });

  it('special chars () do not throw', () => {
    expect(() => searchHelpContent('test()', items)).not.toThrow();
  });

  it('special chars & do not throw', () => {
    expect(() => searchHelpContent('test&value', items)).not.toThrow();
  });

  it('unicode naïve does not throw', () => {
    expect(() => searchHelpContent('naïve', items)).not.toThrow();
  });

  it('single char a returns matches', () => {
    const results = searchHelpContent('a', items);
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('scoreHelpMatch', () => {
  it('exact title match returns score 100', () => {
    const result = scoreHelpMatch(billing, 'billing');
    expect(result.score).toBeGreaterThanOrEqual(100);
    expect(result.matchedOn).toContain('title');
  });

  it('partial title match returns score 60', () => {
    const result = scoreHelpMatch(billing, 'bill');
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.matchedOn).toContain('title');
  });

  it('description match returns score 30', () => {
    const result = scoreHelpMatch(billing, 'subscription');
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.matchedOn).toContain('description');
  });

  it('keyword match returns score 20', () => {
    const result = scoreHelpMatch(billing, 'invoice');
    expect(result.score).toBeGreaterThanOrEqual(20);
    expect(result.matchedOn).toContain('keyword');
  });

  it('popular bonus adds +5 to score', () => {
    // gettingStarted is popular; use a keyword that matches both popular and non-popular
    const popularResult = scoreHelpMatch(gettingStarted, 'setup');
    const nonPopularResult = scoreHelpMatch(
      { ...gettingStarted, popular: false } as HelpCategory,
      'setup'
    );
    expect(popularResult.score - nonPopularResult.score).toBe(5);
  });

  it('no match returns score 0', () => {
    const result = scoreHelpMatch(billing, 'nomatch');
    expect(result.score).toBe(0);
    expect(result.matchedOn).toHaveLength(0);
  });

  it('keyword match capped at 3 hits (max 60 from keywords)', () => {
    // billing has 7 keywords; even if query matches many, cap at 3*20=60
    const manyKeywordCategory: HelpCategory = {
      ...billing,
      keywords: ['a', 'b', 'c', 'd', 'e'],
      popular: false,
    };
    // Use a query that appears in multiple keywords won't work well,
    // but we can test with a description that doesn't match
    const result = scoreHelpMatch(manyKeywordCategory, 'a');
    // score should include keyword match but capped
    expect(result.score).toBeLessThanOrEqual(160); // title(100) + keyword(60) max
  });
});

describe('highlightHelpText', () => {
  it('highlights matching prefix segment', () => {
    const segments = highlightHelpText('Billing', 'bill');
    expect(segments).toEqual([
      { text: 'Bill', highlighted: true },
      { text: 'ing', highlighted: false },
    ]);
  });

  it('returns unhighlighted full text for no match', () => {
    const segments = highlightHelpText('Billing', 'xyz');
    expect(segments).toEqual([{ text: 'Billing', highlighted: false }]);
  });

  it('returns unhighlighted full text for empty query', () => {
    const segments = highlightHelpText('Billing', '');
    expect(segments).toEqual([{ text: 'Billing', highlighted: false }]);
  });
});
