export interface SearchResultItem {
  id: string;
  source: string;
  title: string;
  snippet: string;
  relevanceScore: number;
  metadata: Record<string, unknown>;
  citation: string;
  createdAt: string;
  updatedAt: string;
}

export interface AISearchResponse {
  results: SearchResultItem[];
  totalResults: number;
  avgRelevance: number;
  executionTimeMs: number;
  sourceCounts: Record<string, number>;
}

export interface AISearchFilters {
  query: string;
  sources?: SearchSource[];
  searchType?: 'fulltext' | 'semantic' | 'hybrid';
  minRelevance?: number;
  dateRange?: '24h' | '7d' | '30d' | 'all';
  limit?: number;
  offset?: number;
}

export type SearchSource =
  | 'leads'
  | 'contacts'
  | 'accounts'
  | 'opportunities'
  | 'documents'
  | 'notes'
  | 'conversations'
  | 'messages'
  | 'tickets';

export type SearchType = 'fulltext' | 'semantic' | 'hybrid';
export type DateRange = '24h' | '7d' | '30d' | 'all';
export type SortOption = 'relevance' | 'newest' | 'source';
