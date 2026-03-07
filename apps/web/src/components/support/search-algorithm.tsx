import type { HelpCategory } from '@/lib/support/help-categories';

export type SearchableItem = HelpCategory;
export type MatchField = 'title' | 'description' | 'keyword';

export interface SearchResult {
  item: SearchableItem;
  score: number;
  matchedOn: MatchField[];
}

export interface SearchFilters {
  categoryId: string;
  sortMode: SortMode;
  popularOnly: boolean;
}

export type SortMode = 'relevance' | 'a-z' | 'most-articles';

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  categoryId: '',
  sortMode: 'relevance',
  popularOnly: false,
};

const SCORE_TITLE_EXACT = 100;
const SCORE_TITLE_PARTIAL = 60;
const SCORE_DESCRIPTION_MATCH = 30;
const SCORE_KEYWORD_MATCH = 20;
const BONUS_POPULAR = 5;
const MAX_KEYWORD_HITS = 3;

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

export function scoreHelpMatch(
  item: SearchableItem,
  normalizedQuery: string
): { score: number; matchedOn: MatchField[] } {
  if (!normalizedQuery) return { score: 0, matchedOn: [] };

  let score = 0;
  const matchedOn: MatchField[] = [];
  const escaped = escapeRegex(normalizedQuery);
  const regex = new RegExp(escaped, 'i');

  // Title scoring
  if (item.title.toLowerCase() === normalizedQuery.toLowerCase()) {
    score += SCORE_TITLE_EXACT;
    matchedOn.push('title');
  } else if (regex.test(item.title)) {
    score += SCORE_TITLE_PARTIAL;
    matchedOn.push('title');
  }

  // Description scoring
  if (regex.test(item.description)) {
    score += SCORE_DESCRIPTION_MATCH;
    if (!matchedOn.includes('description')) matchedOn.push('description');
  }

  // Keyword scoring (capped at MAX_KEYWORD_HITS)
  let keywordHits = 0;
  for (const kw of item.keywords) {
    if (keywordHits >= MAX_KEYWORD_HITS) break;
    if (regex.test(kw)) {
      keywordHits++;
    }
  }
  if (keywordHits > 0) {
    score += keywordHits * SCORE_KEYWORD_MATCH;
    matchedOn.push('keyword');
  }

  // Popular bonus
  if (score > 0 && item.popular) {
    score += BONUS_POPULAR;
  }

  return { score, matchedOn };
}

export function searchHelpContent(
  query: string,
  items: readonly SearchableItem[],
  filters?: SearchFilters
): SearchResult[] {
  const mergedFilters = filters ?? DEFAULT_SEARCH_FILTERS;
  const normalizedQuery = query.trim().toLowerCase();

  // Apply pre-filters
  let filtered: SearchableItem[] = [...items];

  if (mergedFilters.categoryId) {
    filtered = filtered.filter((item) => item.id === mergedFilters.categoryId);
  }

  if (mergedFilters.popularOnly) {
    filtered = filtered.filter((item) => item.popular);
  }

  // Score each item
  const results: SearchResult[] = filtered.map((item) => {
    const { score, matchedOn } = scoreHelpMatch(item, normalizedQuery);
    return { item, score, matchedOn };
  });

  // If query is non-empty, only return items with score > 0
  const scored = normalizedQuery
    ? results.filter((r) => r.score > 0)
    : results;

  // Sort based on mode
  switch (mergedFilters.sortMode) {
    case 'a-z':
      scored.sort((a, b) => a.item.title.localeCompare(b.item.title));
      break;
    case 'most-articles':
      scored.sort((a, b) => b.item.articleCount - a.item.articleCount);
      break;
    case 'relevance':
    default:
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.item.order - b.item.order;
      });
      break;
  }

  return scored;
}

export function highlightHelpText(
  text: string,
  query: string
): { text: string; highlighted: boolean }[] {
  if (!query.trim()) {
    return [{ text, highlighted: false }];
  }

  const escaped = escapeRegex(query.trim());
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  if (parts.length === 1) {
    return [{ text, highlighted: false }];
  }

  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      highlighted: regex.test(part),
    }));
}
