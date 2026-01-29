/**
 * Search Retrieval Module (IFC-155)
 *
 * Re-exports search and retrieval types from ai-worker services.
 * This package provides the public API for search functionality.
 *
 * Implementation: apps/ai-worker/src/services/retrieval-service.ts
 *
 * @module @intelliflow/search/retrieval
 */

import { z } from 'zod';

// ============================================
// Search Configuration
// ============================================

export const SearchConfigSchema = z.object({
  query: z.string().min(1),
  sources: z
    .array(z.enum(['leads', 'contacts', 'accounts', 'opportunities', 'tickets', 'documents', 'notes']))
    .default(['leads', 'contacts']),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
  minScore: z.number().min(0).max(1).default(0.3),
  searchMode: z.enum(['fulltext', 'semantic', 'hybrid']).default('hybrid'),

  // Filters
  filters: z
    .object({
      status: z.array(z.string()).optional(),
      dateRange: z
        .object({
          start: z.date().optional(),
          end: z.date().optional(),
        })
        .optional(),
      owner: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),

  // Document-specific filters (IFC-155)
  caseId: z.string().uuid().optional(),
  classification: z.array(z.string()).optional(),
  documentTypes: z.array(z.string()).optional(),
  semanticThreshold: z.number().min(0).max(1).default(0.7),
});

export type SearchConfig = z.infer<typeof SearchConfigSchema>;

// ============================================
// Search Results
// ============================================

export interface SearchResult {
  id: string;
  type: 'lead' | 'contact' | 'account' | 'opportunity' | 'ticket' | 'document' | 'note';
  title: string;
  subtitle?: string;
  snippet?: string;
  score: number;
  metadata: Record<string, unknown>;
  highlights?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  queryTimeMs: number;
  searchMode: 'fulltext' | 'semantic' | 'hybrid';
}

// ============================================
// ACL Types
// ============================================

export interface ACLContext {
  tenantId: string;
  userId: string;
  roles: string[];
  permissions: string[];
  teamIds?: string[];
  caseIds?: string[];
}

export interface ACLFilter {
  tenantId: string;
  ownerIds?: string[];
  teamIds?: string[];
  caseIds?: string[];
  includeShared?: boolean;
}

// ============================================
// Relevance Configuration
// ============================================

export interface RelevanceConfig {
  fullTextWeight: number;
  semanticWeight: number;
  recencyBoost: number;
  recencyDecayDays: number;
  minScoreThreshold: number;
  maxResults: number;
  diversityPenalty: number;
}

export const DEFAULT_RELEVANCE_CONFIG: RelevanceConfig = {
  fullTextWeight: 0.4,
  semanticWeight: 0.6,
  recencyBoost: 0.1,
  recencyDecayDays: 30,
  minScoreThreshold: 0.3,
  maxResults: 50,
  diversityPenalty: 0.05,
};

// ============================================
// FTS and Vector Search Results
// ============================================

export interface FTSSearchResult {
  id: string;
  title: string;
  description: string | null;
  extracted_text: string | null;
  rank: number;
  headline: string | null;
}

export interface VectorSearchResult {
  id: string;
  title: string;
  description: string | null;
  similarity: number;
}

// ============================================
// Service Interface
// ============================================

/**
 * Interface for the retrieval service.
 * Actual implementation in apps/ai-worker/src/services/retrieval-service.ts
 */
export interface IRetrievalService {
  search(config: SearchConfig, aclContext: ACLContext): Promise<SearchResponse>;
  searchDocuments(config: SearchConfig, aclContext: ACLContext): Promise<SearchResponse>;
  searchNotes(config: SearchConfig, aclContext: ACLContext): Promise<SearchResponse>;
}

/**
 * Interface for the ACL service.
 * Actual implementation in apps/ai-worker/src/services/retrieval-service.ts
 */
export interface IACLService {
  getUserContext(tenantId: string, userId: string): Promise<ACLContext>;
  canAccessResource(
    aclContext: ACLContext,
    resourceType: string,
    resourceId: string,
    action: string
  ): Promise<boolean>;
}

/**
 * Interface for relevance evaluation.
 * Actual implementation in apps/ai-worker/src/services/retrieval-service.ts
 */
export interface IRelevanceEvaluator {
  scoreResult(result: SearchResult, query: string): number;
  rankResults(results: SearchResult[], query: string): SearchResult[];
  evaluateRelevance(
    results: SearchResult[],
    query: string
  ): {
    avgScore: number;
    topScore: number;
    distribution: Record<string, number>;
  };
}
