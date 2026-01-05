/**
 * @intelliflow/search - Search and Indexing Package (IFC-155)
 *
 * This package provides the public API for search and indexing functionality.
 * The actual implementations are in apps/ai-worker/src/services.
 *
 * Features:
 * - Full-text search using PostgreSQL tsvector
 * - Semantic search using pgvector embeddings
 * - Hybrid search combining FTS + semantic with RRF
 * - ACL-based filtering for tenant/case isolation
 * - Background re-indexing via BullMQ workers
 * - GDPR/DSAR compliant data purge
 *
 * @module @intelliflow/search
 */

// Retrieval Service
export {
  SearchConfigSchema,
  type SearchConfig,
  type SearchResult,
  type SearchResponse,
  type ACLContext,
  type ACLFilter,
  type RelevanceConfig,
  DEFAULT_RELEVANCE_CONFIG,
  type FTSSearchResult,
  type VectorSearchResult,
  type IRetrievalService,
  type IACLService,
  type IRelevanceEvaluator,
} from './retrieval';

// Document Indexer
export {
  IndexerConfigSchema,
  type IndexerConfig,
  DEFAULT_INDEXER_CONFIG,
  type IndexResult,
  type BatchIndexResult,
  type ReindexProgress,
  type DocumentToIndex,
  type NoteToIndex,
  type IDocumentIndexer,
} from './indexer';

// Reindex Worker
export {
  REINDEX_QUEUE_NAME,
  ReindexJobDataSchema,
  type ReindexJobData,
  type ReindexJobResult,
  type ReindexJobProgress,
  type ReindexJobStatus,
  type QueueStats,
  type IReindexWorker,
  type ScheduleOptions,
} from './worker';

// ============================================
// Search Modes
// ============================================

export type SearchMode = 'fulltext' | 'semantic' | 'hybrid';

export const SEARCH_MODES: readonly SearchMode[] = ['fulltext', 'semantic', 'hybrid'] as const;

// ============================================
// Search Sources
// ============================================

export type SearchSource = 'leads' | 'contacts' | 'accounts' | 'opportunities' | 'tickets' | 'documents' | 'notes';

export const SEARCH_SOURCES: readonly SearchSource[] = [
  'leads',
  'contacts',
  'accounts',
  'opportunities',
  'tickets',
  'documents',
  'notes',
] as const;

// ============================================
// Performance Constants
// ============================================

export const SEARCH_PERFORMANCE = {
  /** Target p95 latency for hybrid search (ms) */
  TARGET_LATENCY_P95_MS: 200,

  /** Default semantic similarity threshold */
  DEFAULT_SEMANTIC_THRESHOLD: 0.7,

  /** Maximum results per search */
  MAX_RESULTS: 100,

  /** Default batch size for indexing */
  DEFAULT_BATCH_SIZE: 10,

  /** Embedding model dimensions */
  EMBEDDING_DIMENSIONS: 1536,
} as const;
